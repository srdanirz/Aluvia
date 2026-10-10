import { randomUUID } from "node:crypto";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  contactViews,
  disasterTypes,
  emergencies,
  emergencyMembers,
  notifications,
  shiftSignups,
  shifts,
  users,
  workItemEvents,
  workItems,
  workTypes,
  worksiteContacts,
  worksites,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";

// Racers hold their row lock for a moment before committing, so the others really wait on it.
const RACERS = 8;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

const NOW = new Date("2026-10-10T12:00:00Z");

// Postgres SQLSTATE codes the schema relies on to reject bad writes.
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const INVALID_PARAMETER_VALUE = "22023";

/** Resolves to the SQLSTATE of the error the write raised; drizzle wraps the driver error in `cause`. */
async function rejectionCode(write: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code;
  }
  throw new Error("expected the write to be rejected");
}

async function createEmergency(slug: string) {
  const [emergency] = await db
    .insert(emergencies)
    .values({
      slug,
      disasterTypeKey: "test_flood",
      name: { es: slug },
      defaultLocale: "es",
      timeZone: "America/Santiago",
      startedAt: NOW,
    })
    .returning({ id: emergencies.id });
  if (!emergency) throw new Error("emergency not created");
  await db.insert(workTypes).values({ emergencyId: emergency.id, key: "mud", name: { es: "Barro" } });
  return emergency.id;
}

async function createWorksite(emergencyId: string) {
  const id = randomUUID();
  await db
    .insert(worksites)
    .values({ id, emergencyId, location: { x: -70.5, y: -33.4 }, source: "neighbor" });
  return id;
}

async function createWorkItem(emergencyId: string) {
  const worksiteId = await createWorksite(emergencyId);
  const id = randomUUID();
  await db.insert(workItems).values({ id, emergencyId, worksiteId, workTypeKey: "mud" });
  return id;
}

async function createUsers(n: number) {
  const rows = await db
    .insert(users)
    .values(Array.from({ length: n }, (_, i) => ({ name: `Volunteer ${i}` })))
    .returning({ id: users.id });
  return rows.map((row) => row.id);
}

let emergencyA: string;
let emergencyB: string;
let userId: string;

beforeAll(async () => {
  await db.insert(disasterTypes).values({ key: "test_flood", name: { es: "Prueba" } });
  emergencyA = await createEmergency("test-a");
  emergencyB = await createEmergency("test-b");
  const [first] = await createUsers(1);
  if (!first) throw new Error("user not created");
  userId = first;
});

describe("locations", () => {
  // An SRID-less point is stamped 4326 by the column typmod; a different SRID is rejected.
  it("stores points in WGS 84 and rejects any other SRID", async () => {
    const id = await createWorksite(emergencyA);
    const [row] = await db
      .select({ srid: sql<number>`st_srid(${worksites.location})`, location: worksites.location })
      .from(worksites)
      .where(eq(worksites.id, id));
    expect(row).toEqual({ srid: 4326, location: { x: -70.5, y: -33.4 } });

    const code = await rejectionCode(
      db.execute(
        sql`insert into worksites (id, emergency_id, location, source)
            values (${randomUUID()}, ${emergencyA}, st_setsrid(st_makepoint(-70.5, -33.4), 3857), 'neighbor')`,
      ),
    );
    expect(code).toBe(INVALID_PARAMETER_VALUE);
  });
});

describe("emergency boundaries", () => {
  it("rejects a work type from another emergency's catalog", async () => {
    const worksiteId = await createWorksite(emergencyA);
    await db.insert(workTypes).values({ emergencyId: emergencyB, key: "roof", name: { es: "Techo" } });
    const code = await rejectionCode(
      db
        .insert(workItems)
        .values({ id: randomUUID(), emergencyId: emergencyA, worksiteId, workTypeKey: "roof" }),
    );
    expect(code).toBe(FOREIGN_KEY_VIOLATION);
  });

  it("rejects rows that point at a home or work item of another emergency", async () => {
    const homeInB = await createWorksite(emergencyB);
    const itemInB = await createWorkItem(emergencyB);
    const writes = [
      db
        .insert(workItems)
        .values({ id: randomUUID(), emergencyId: emergencyA, worksiteId: homeInB, workTypeKey: "mud" }),
      db.insert(contactViews).values({ emergencyId: emergencyA, userId, worksiteId: homeInB }),
      db.insert(notifications).values({
        emergencyId: emergencyA,
        eventKey: "cross",
        type: "work_item_claimed",
        worksiteId: homeInB,
        channel: "sms",
        level: "important",
      }),
      db
        .insert(workItemEvents)
        .values({ workItemId: itemInB, emergencyId: emergencyA, toStatus: "open_claimed" }),
    ];
    const codes = await Promise.all(writes.map(rejectionCode));
    expect(codes).toEqual(writes.map(() => FOREIGN_KEY_VIOLATION));
  });
});

describe("work items", () => {
  it("lets exactly one of many concurrent claims win", async () => {
    const id = await createWorkItem(emergencyA);
    const racers = await createUsers(RACERS);

    const claim = (by: string) =>
      db.transaction(async (tx) => {
        const rows = await tx
          .update(workItems)
          .set({ claimedBy: by, status: "open_claimed", version: sql`${workItems.version} + 1` })
          .where(and(eq(workItems.id, id), isNull(workItems.claimedBy)))
          .returning({ id: workItems.id });
        await tx.execute(sql`select pg_sleep(0.05)`);
        return rows.length;
      });

    const won = await Promise.all(racers.map(claim));
    expect(won.filter((n) => n === 1)).toHaveLength(1);

    const [item] = await db
      .select({ version: workItems.version })
      .from(workItems)
      .where(eq(workItems.id, id));
    expect(item?.version).toBe(1);
  });

  it("rejects an unclaimed item with a claimant", async () => {
    const id = await createWorkItem(emergencyA);
    const code = await rejectionCode(
      db.update(workItems).set({ claimedBy: userId }).where(eq(workItems.id, id)),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe("shifts", () => {
  async function createShift(capacity: number) {
    const [shift] = await db
      .insert(shifts)
      .values({
        emergencyId: emergencyA,
        meetingPoint: "Plaza",
        startsAt: new Date("2026-10-11T09:00:00Z"),
        endsAt: new Date("2026-10-11T13:00:00Z"),
        capacity,
      })
      .returning({ id: shifts.id });
    if (!shift) throw new Error("shift not created");
    return shift.id;
  }

  class ShiftFull extends Error {}

  /** The sign-up sequence from STYLEGUIDE, Concurrencia: insert the sign-up, then take a seat, or roll back. */
  const signUp = (shiftId: string, user: string) =>
    db
      .transaction(async (tx) => {
        await tx.insert(shiftSignups).values({ shiftId, userId: user });
        const seat = await tx
          .update(shifts)
          .set({ filled: sql`${shifts.filled} + 1` })
          .where(and(eq(shifts.id, shiftId), sql`${shifts.filled} < ${shifts.capacity}`))
          .returning({ id: shifts.id });
        await tx.execute(sql`select pg_sleep(0.05)`);
        if (seat.length === 0) throw new ShiftFull();
        return true;
      })
      .catch((error: unknown) => {
        if (error instanceof ShiftFull) return false;
        throw error;
      });

  it("fills exactly its capacity under concurrent sign-ups", async () => {
    const shiftId = await createShift(3);
    const racers = await createUsers(RACERS);

    const results = await Promise.all(racers.map((user) => signUp(shiftId, user)));
    expect(results.filter(Boolean)).toHaveLength(3);

    const [shift] = await db.select({ filled: shifts.filled }).from(shifts).where(eq(shifts.id, shiftId));
    const [active] = await db
      .select({ n: count() })
      .from(shiftSignups)
      .where(and(eq(shiftSignups.shiftId, shiftId), isNull(shiftSignups.cancelledAt)));
    expect(shift?.filled).toBe(3);
    expect(active?.n).toBe(3);
  });

  it("rejects filled above capacity and a shift that ends before it starts", async () => {
    const shiftId = await createShift(1);
    expect(await rejectionCode(db.update(shifts).set({ filled: 2 }).where(eq(shifts.id, shiftId)))).toBe(
      CHECK_VIOLATION,
    );
    const code = await rejectionCode(
      db.insert(shifts).values({
        emergencyId: emergencyA,
        meetingPoint: "Plaza",
        startsAt: new Date("2026-10-11T13:00:00Z"),
        endsAt: new Date("2026-10-11T09:00:00Z"),
        capacity: 5,
      }),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("allows one active sign-up per person, and a new one after cancelling", async () => {
    const shiftId = await createShift(5);
    expect(await signUp(shiftId, userId)).toBe(true);
    expect(await rejectionCode(signUp(shiftId, userId))).toBe(UNIQUE_VIOLATION);

    await db
      .update(shiftSignups)
      .set({ cancelledAt: NOW })
      .where(and(eq(shiftSignups.shiftId, shiftId), eq(shiftSignups.userId, userId)));
    expect(await signUp(shiftId, userId)).toBe(true);
  });
});

describe("notifications", () => {
  it("queues one message per event, recipient and channel", async () => {
    const row = {
      emergencyId: emergencyA,
      eventKey: "work_item_claimed:1",
      type: "work_item_claimed",
      userId,
      channel: "sms" as const,
      level: "important" as const,
    };
    await db.insert(notifications).values(row);
    expect(await rejectionCode(db.insert(notifications).values(row))).toBe(UNIQUE_VIOLATION);
    expect(await db.insert(notifications).values(row).onConflictDoNothing().returning()).toEqual([]);
  });

  it("requires exactly one recipient", async () => {
    const worksiteId = await createWorksite(emergencyA);
    const base = {
      emergencyId: emergencyA,
      eventKey: "test",
      type: "work_item_claimed",
      channel: "sms" as const,
      level: "normal" as const,
    };
    expect(await rejectionCode(db.insert(notifications).values(base))).toBe(CHECK_VIOLATION);
    expect(await rejectionCode(db.insert(notifications).values({ ...base, userId, worksiteId }))).toBe(
      CHECK_VIOLATION,
    );
  });
});

describe("people and contacts", () => {
  it("treats emails as case-insensitive and phones as E.164", async () => {
    await db.insert(users).values({ name: "Mail test", email: "mail.test@example.org" });
    expect(
      await rejectionCode(db.insert(users).values({ name: "Dup", email: "Mail.Test@example.org" })),
    ).toBe(UNIQUE_VIOLATION);
    expect(await rejectionCode(db.insert(users).values({ name: "Phone", phone: "9 1234 5678" }))).toBe(
      CHECK_VIOLATION,
    );
  });

  it("records a neighbor's consent only for SMS or WhatsApp, with a phone", async () => {
    // Placeholder number from no real person; the check only looks at its shape.
    const consent = { notifyConsentAt: NOW, phone: "+56900000000" };
    const push = { worksiteId: await createWorksite(emergencyA), notifyChannel: "push" as const, ...consent };
    const noPhone = {
      worksiteId: await createWorksite(emergencyA),
      notifyChannel: "sms" as const,
      notifyConsentAt: NOW,
    };
    expect(await rejectionCode(db.insert(worksiteContacts).values(push))).toBe(CHECK_VIOLATION);
    expect(await rejectionCode(db.insert(worksiteContacts).values(noPhone))).toBe(CHECK_VIOLATION);

    const ok = { worksiteId: await createWorksite(emergencyA), notifyChannel: "sms" as const, ...consent };
    await expect(db.insert(worksiteContacts).values(ok)).resolves.toBeDefined();
  });

  it("does not let a member approve themselves", async () => {
    const code = await rejectionCode(
      db
        .insert(emergencyMembers)
        .values({ emergencyId: emergencyA, userId, approvedBy: userId, approvedAt: NOW }),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});
