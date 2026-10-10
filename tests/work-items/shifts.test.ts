import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { cancelShiftSignup, signUpForShift } from "@/features/shifts/server";
import { shiftSignups, shifts } from "@/shared/db/schema";

import { createTestDb } from "../setup/db";
import { createEmergency, createShift, createUsers, NOW, outboxFor } from "./fixtures";

const RACERS = 8;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

const filledOf = async (shiftId: string) =>
  (await db.select({ filled: shifts.filled }).from(shifts).where(eq(shifts.id, shiftId)))[0]?.filled;

describe("signUpForShift", () => {
  it("fills exactly its capacity under concurrent sign-ups, each with its reminder", async () => {
    const emergency = await createEmergency(db);
    const volunteers = await createUsers(db, emergency.id, RACERS);
    const shiftId = await createShift(db, emergency.id, { capacity: 3 });

    const results = await Promise.all(
      volunteers.map((userId) =>
        signUpForShift(db, { emergencyId: emergency.id, shiftId, userId, now: NOW }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.code)).toEqual(
      Array(RACERS - 3).fill("shift_full"),
    );
    expect(await filledOf(shiftId)).toBe(3);
    const signups = await db.select().from(shiftSignups).where(eq(shiftSignups.shiftId, shiftId));
    expect(signups).toHaveLength(3);
    const reminders = await Promise.all(
      signups.map((signup) => outboxFor(db, `shift_reminder:${signup.id}`)),
    );
    expect(reminders.map((rows) => rows.length)).toEqual([1, 1, 1]);
  });

  it("takes one seat for a person who taps many times at once", async () => {
    const emergency = await createEmergency(db);
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const shiftId = await createShift(db, emergency.id, { capacity: 5 });

    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        signUpForShift(db, { emergencyId: emergency.id, shiftId, userId: volunteer!, now: NOW }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await filledOf(shiftId)).toBe(1);
  });

  it("refuses non-members and shifts that already started", async () => {
    const emergency = await createEmergency(db);
    const [outsider] = await createUsers(db, emergency.id, 1, null);
    const [member] = await createUsers(db, emergency.id, 1);
    const upcoming = await createShift(db, emergency.id);
    const started = await createShift(db, emergency.id, { startsAt: new Date(NOW.getTime() - 3600_000) });

    expect(
      await signUpForShift(db, { emergencyId: emergency.id, shiftId: upcoming, userId: outsider!, now: NOW }),
    ).toEqual({
      ok: false,
      code: "not_member",
    });
    expect(
      await signUpForShift(db, { emergencyId: emergency.id, shiftId: started, userId: member!, now: NOW }),
    ).toEqual({
      ok: false,
      code: "shift_started",
    });
  });

  it("schedules the reminder two hours before, or at 20:00 the evening before an early shift", async () => {
    const emergency = await createEmergency(db);
    const [volunteer] = await createUsers(db, emergency.id, 1);
    // America/Santiago is UTC-3 in October 2026.
    const afternoon = await createShift(db, emergency.id, { startsAt: new Date("2026-10-12T18:00:00Z") });
    const early = await createShift(db, emergency.id, { startsAt: new Date("2026-10-12T11:00:00Z") });

    await signUpForShift(db, { emergencyId: emergency.id, shiftId: afternoon, userId: volunteer!, now: NOW });
    await signUpForShift(db, { emergencyId: emergency.id, shiftId: early, userId: volunteer!, now: NOW });

    const signups = await db.select().from(shiftSignups).where(eq(shiftSignups.userId, volunteer!));
    const reminderOf = async (shiftId: string) => {
      const signup = signups.find((s) => s.shiftId === shiftId);
      const [row] = await outboxFor(db, `shift_reminder:${signup?.id}`);
      return row ? new Date(row.not_before) : undefined;
    };
    expect(await reminderOf(afternoon)).toEqual(new Date("2026-10-12T16:00:00Z"));
    expect(await reminderOf(early)).toEqual(new Date("2026-10-11T23:00:00Z"));
  });
});

describe("cancelShiftSignup", () => {
  it("frees the seat once, however many times it is tapped, and withdraws the reminder", async () => {
    const emergency = await createEmergency(db);
    const [volunteer, other] = await createUsers(db, emergency.id, 2);
    const shiftId = await createShift(db, emergency.id, { capacity: 1 });
    await signUpForShift(db, { emergencyId: emergency.id, shiftId, userId: volunteer!, now: NOW });
    const [signup] = await db.select().from(shiftSignups).where(eq(shiftSignups.userId, volunteer!));

    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        cancelShiftSignup(db, { emergencyId: emergency.id, shiftId, userId: volunteer!, now: NOW }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await filledOf(shiftId)).toBe(0);
    const reminders = await outboxFor(db, `shift_reminder:${signup?.id}`);
    expect(reminders.map((r) => r.cancelled_at !== null)).toEqual([true]);
    // The seat is really free: someone else takes it, and the first person can come back as a new row.
    expect(
      await signUpForShift(db, { emergencyId: emergency.id, shiftId, userId: other!, now: NOW }),
    ).toEqual({ ok: true });
  });
});
