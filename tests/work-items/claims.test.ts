import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  claimWorkItem,
  markWorkItemArrived,
  markWorkItemStatus,
  releaseExpiredClaims,
  releaseWorkItem,
  renewWorkItemClaim,
} from "@/features/work-items/server";
import { emergencies, users, workItemEvents, workItems, worksites } from "@/shared/db/schema";

import { createTestDb } from "../setup/db";
import { createEmergency, createUsers, createWorksite, NOW, outboxFor } from "./fixtures";

const RACERS = 8;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

const minutesAfter = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
// The deadline is a real time budget; `now` is the fixed database instant the sweep acts at.
const sweep = (now: Date) => releaseExpiredClaims(db, { now, deadline: new Date(Date.now() + 60_000) });

async function readItem(id: string) {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, id));
  if (!item) throw new Error("work item missing");
  return item;
}

async function readUnclaimedSince(worksiteId: string) {
  const [row] = await db
    .select({ unclaimedSince: worksites.unclaimedSince })
    .from(worksites)
    .where(eq(worksites.id, worksiteId));
  return row?.unclaimedSince ?? null;
}

const eventKinds = async (workItemId: string) =>
  (
    await db
      .select({ kind: workItemEvents.kind })
      .from(workItemEvents)
      .where(eq(workItemEvents.workItemId, workItemId))
      .orderBy(workItemEvents.id)
  ).map((e) => e.kind);

describe("claimWorkItem", () => {
  it("lets exactly one of many concurrent volunteers claim, with one event and one neighbor notice", async () => {
    const emergency = await createEmergency(db);
    const volunteers = await createUsers(db, emergency.id, RACERS);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id, { neighborChannel: "sms" });
    const workItemId = workItemIds[0]!;

    const results = await Promise.all(
      volunteers.map((userId) =>
        claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId, now: NOW }),
      ),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.code)).toEqual(
      Array(RACERS - 1).fill("already_claimed"),
    );
    const item = await readItem(workItemId);
    expect(item.status).toBe("open_claimed");
    expect(item.claimExpiresAt).toEqual(minutesAfter(120));
    expect(await eventKinds(workItemId)).toEqual(["claimed"]);
    expect(await readUnclaimedSince(worksiteId)).toBeNull();
    const winner = volunteers[results.findIndex((r) => r.ok)];
    const notices = await outboxFor(db, `work_item_claimed:${worksiteId}:${winner}:${NOW.toISOString()}`);
    expect(notices.map((n) => n.worksite_id)).toEqual([worksiteId]);
  });

  it("requires membership of the emergency and an open emergency", async () => {
    const emergency = await createEmergency(db);
    const [outsider] = await createUsers(db, emergency.id, 1, null);
    const [member] = await createUsers(db, emergency.id, 1);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;

    expect(
      await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: outsider!, now: NOW }),
    ).toEqual({
      ok: false,
      code: "not_member",
    });
    await db
      .update(emergencies)
      .set({ status: "closed", closedAt: NOW })
      .where(eq(emergencies.id, emergency.id));
    expect(
      await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: member!, now: NOW }),
    ).toEqual({
      ok: false,
      code: "not_open",
    });
    expect((await readItem(workItemId)).claimedBy).toBeNull();
  });

  it("blocks a home with an unreviewed do-not-enter risk until a coordinator reviews it", async () => {
    const emergency = await createEmergency(db);
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id);
    await db
      .update(worksites)
      .set({ hazards: ["gas"] })
      .where(eq(worksites.id, worksiteId));
    const ref = { emergencyId: emergency.id, workItemId: workItemIds[0]!, userId: volunteer!, now: NOW };

    expect(await claimWorkItem(db, ref)).toEqual({ ok: false, code: "hazard_unreviewed" });
    await db.update(worksites).set({ hazardsReviewedAt: NOW }).where(eq(worksites.id, worksiteId));
    expect((await claimWorkItem(db, ref)).ok).toBe(true);
  });

  it("answers not_found for a work item of another emergency", async () => {
    const mine = await createEmergency(db);
    const other = await createEmergency(db);
    const [member] = await createUsers(db, mine.id, 1);
    const { workItemIds } = await createWorksite(db, other.id);
    expect(
      await claimWorkItem(db, {
        emergencyId: mine.id,
        workItemId: workItemIds[0]!,
        userId: member!,
        now: NOW,
      }),
    ).toEqual({ ok: false, code: "not_found" });
  });

  it("takes the home off the waiting list while one job is held, and puts it back on release", async () => {
    const emergency = await createEmergency(db);
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const since = minutesAfter(-90);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id, {
      keys: ["mud", "debris"],
      unclaimedSince: since,
    });

    await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: workItemIds[0]!,
      userId: volunteer!,
      now: NOW,
    });
    // One job claimed means someone is on the home: it no longer counts as abandoned (ADR 0005).
    expect(await readUnclaimedSince(worksiteId)).toBeNull();

    await releaseWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: workItemIds[0]!,
      userId: volunteer!,
      now: minutesAfter(5),
    });
    expect(await readUnclaimedSince(worksiteId)).toEqual(minutesAfter(5));
  });
});

describe("reservation expiry", () => {
  it("releases a lapsed reservation with its event, turns the home red and tells the volunteer", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: volunteer!, now: NOW });

    expect(await sweep(minutesAfter(29))).toBe(0);
    expect(await sweep(minutesAfter(31))).toBe(1);

    const item = await readItem(workItemId);
    expect(item).toMatchObject({ status: "open_unclaimed", claimedBy: null, claimExpiresAt: null });
    expect(await eventKinds(workItemId)).toEqual(["claimed", "expired"]);
    expect(await readUnclaimedSince(worksiteId)).toEqual(minutesAfter(31));
    const notices = await outboxFor(
      db,
      `work_item_claim_expired:sweep:${emergency.id}:${minutesAfter(31).toISOString()}`,
    );
    expect(notices.map((n) => n.user_id)).toEqual([volunteer]);
  });

  it("does not expire a reservation once the volunteer arrived", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const ref = { emergencyId: emergency.id, workItemId: workItemIds[0]!, userId: volunteer! };
    await claimWorkItem(db, { ...ref, now: NOW });

    expect(await markWorkItemArrived(db, { ...ref, now: minutesAfter(20) })).toMatchObject({ ok: true });
    expect(await sweep(minutesAfter(60))).toBe(0);
    const item = await readItem(ref.workItemId);
    expect(item).toMatchObject({ status: "open_claimed", claimedBy: volunteer, arrivedAt: minutesAfter(20) });
    expect(await eventKinds(ref.workItemId)).toEqual(["claimed", "arrived"]);
  });

  it("renews a live reservation and refuses to renew a lapsed one", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const ref = { emergencyId: emergency.id, workItemId: workItemIds[0]!, userId: volunteer! };
    await claimWorkItem(db, { ...ref, now: NOW });

    expect(await renewWorkItemClaim(db, { ...ref, now: minutesAfter(25) })).toEqual({
      ok: true,
      data: { expiresAt: minutesAfter(55) },
    });
    expect(await renewWorkItemClaim(db, { ...ref, now: minutesAfter(56) })).toEqual({
      ok: false,
      code: "claim_lost",
    });
  });

  it("lets another volunteer take a lapsed reservation before the sweeper runs", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [first, second] = await createUsers(db, emergency.id, 2);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: first!, now: NOW });

    const takeover = await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId,
      userId: second!,
      now: minutesAfter(40),
    });
    expect(takeover.ok).toBe(true);
    expect((await readItem(workItemId)).claimedBy).toBe(second);
    expect(await eventKinds(workItemId)).toEqual(["claimed", "expired", "claimed"]);
    const notices = await outboxFor(db, `work_item_claim_expired:${workItemId}:${NOW.toISOString()}`);
    expect(notices.map((n) => n.user_id)).toEqual([first]);
  });

  it("never loses or doubles a claim when sweepers race new claims on lapsed reservations", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const volunteers = await createUsers(db, emergency.id, RACERS);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: volunteers[0]!, now: NOW });

    const later = minutesAfter(45);
    const results = await Promise.all([
      sweep(later),
      sweep(later),
      ...volunteers
        .slice(1)
        .map((userId) => claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId, now: later })),
    ]);
    const claims = results.slice(2) as Awaited<ReturnType<typeof claimWorkItem>>[];

    expect(claims.filter((r) => r.ok)).toHaveLength(1);
    const item = await readItem(workItemId);
    expect(item.status).toBe("open_claimed");
    expect(volunteers.slice(1)).toContain(item.claimedBy);
    const kinds = await eventKinds(workItemId);
    // The lapse is recorded once, by whoever got the row first: a sweeper or the winning claim.
    expect(kinds.filter((k) => k === "expired")).toHaveLength(1);
    expect(kinds.filter((k) => k === "claimed")).toHaveLength(2);
  });
});

describe("progress and expiry together", () => {
  it("keeps a partially done status through a new claim that lapses", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [first, second] = await createUsers(db, emergency.id, 2);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: first!, now: NOW });
    const { version } = await readItem(workItemId);
    await markWorkItemStatus(db, {
      emergencyId: emergency.id,
      workItemId,
      userId: first!,
      version,
      status: "open_partially_done",
      now: NOW,
    });
    await releaseWorkItem(db, { emergencyId: emergency.id, workItemId, userId: first!, now: NOW });
    expect((await readItem(workItemId)).status).toBe("open_partially_done");

    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: second!, now: NOW });
    expect(await readItem(workItemId)).toMatchObject({ status: "open_partially_done", claimedBy: second });
    await sweep(minutesAfter(31));
    expect(await readItem(workItemId)).toMatchObject({ status: "open_partially_done", claimedBy: null });
  });

  it("lets anyone take a job whose claimant's account was deleted", async () => {
    const emergency = await createEmergency(db);
    const [gone, other] = await createUsers(db, emergency.id, 2);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: gone!, now: NOW });

    await db.delete(users).where(eq(users.id, gone!));
    expect(await readItem(workItemId)).toMatchObject({ status: "open_claimed", claimedBy: null });
    expect(
      (await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: other!, now: NOW })).ok,
    ).toBe(true);
  });

  it("never lets the sweeper undo an arrival or a renewal that won the row", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const volunteers = await createUsers(db, emergency.id, RACERS);
    const homes = await Promise.all(volunteers.map(() => createWorksite(db, emergency.id)));
    const refs = homes.map((home, i) => ({
      emergencyId: emergency.id,
      workItemId: home.workItemIds[0]!,
      userId: volunteers[i]!,
    }));
    await Promise.all(refs.map((ref) => claimWorkItem(db, { ...ref, now: NOW })));

    // A minute before expiry by the volunteers' clock, while the sweeper already sees it lapsed.
    const results = await Promise.all([
      sweep(minutesAfter(31)),
      ...refs.map((ref, i) =>
        i % 2 === 0
          ? markWorkItemArrived(db, { ...ref, now: minutesAfter(29) })
          : renewWorkItemClaim(db, { ...ref, now: minutesAfter(29) }),
      ),
    ]);
    const items = await Promise.all(refs.map((ref) => readItem(ref.workItemId)));
    results.slice(1).forEach((result, i) => {
      const item = items[i]!;
      // Whoever got the row first decides; the outcome is always one consistent story.
      if ((result as { ok: boolean }).ok) expect(item.claimedBy).toBe(volunteers[i]);
      else expect(item).toMatchObject({ claimedBy: null, status: "open_unclaimed" });
    });
  });

  it("puts a home back on the list when its two holders release at the same time", async () => {
    const emergency = await createEmergency(db);
    const [x, y] = await createUsers(db, emergency.id, 2);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id, { keys: ["mud", "debris"] });
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId: workItemIds[0]!, userId: x!, now: NOW });
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId: workItemIds[1]!, userId: y!, now: NOW });

    await Promise.all([
      releaseWorkItem(db, {
        emergencyId: emergency.id,
        workItemId: workItemIds[0]!,
        userId: x!,
        now: minutesAfter(1),
      }),
      releaseWorkItem(db, {
        emergencyId: emergency.id,
        workItemId: workItemIds[1]!,
        userId: y!,
        now: minutesAfter(1),
      }),
    ]);
    expect(await readUnclaimedSince(worksiteId)).toEqual(minutesAfter(1));
  });
});

describe("a closed emergency", () => {
  it("is never swept and its holds cannot be renewed or released", async () => {
    const emergency = await createEmergency(db, { holdMinutes: 30 });
    const [volunteer] = await createUsers(db, emergency.id, 1);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const ref = { emergencyId: emergency.id, workItemId: workItemIds[0]!, userId: volunteer! };
    await claimWorkItem(db, { ...ref, now: NOW });
    await db
      .update(emergencies)
      .set({ status: "closed", closedAt: NOW })
      .where(eq(emergencies.id, emergency.id));

    expect(await renewWorkItemClaim(db, { ...ref, now: minutesAfter(10) })).toEqual({
      ok: false,
      code: "emergency_closed",
    });
    expect(await releaseWorkItem(db, { ...ref, now: minutesAfter(10) })).toEqual({
      ok: false,
      code: "emergency_closed",
    });
    await sweep(minutesAfter(60));
    expect(await readItem(ref.workItemId)).toMatchObject({ status: "open_claimed", claimedBy: volunteer });
  });
});

describe("releaseWorkItem", () => {
  it("only lets the claimant release, once", async () => {
    const emergency = await createEmergency(db);
    const [owner, other] = await createUsers(db, emergency.id, 2);
    const { workItemIds } = await createWorksite(db, emergency.id);
    const workItemId = workItemIds[0]!;
    await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: owner!, now: NOW });

    expect(
      await releaseWorkItem(db, { emergencyId: emergency.id, workItemId, userId: other!, now: NOW }),
    ).toEqual({
      ok: false,
      code: "claim_lost",
    });
    const releases = await Promise.all(
      [1, 2, 3].map(() =>
        releaseWorkItem(db, { emergencyId: emergency.id, workItemId, userId: owner!, now: NOW }),
      ),
    );
    expect(releases.filter((r) => r.ok)).toHaveLength(1);
    expect(await readItem(workItemId)).toMatchObject({ status: "open_unclaimed", claimedBy: null });
    expect(await eventKinds(workItemId)).toEqual(["claimed", "released"]);
  });
});

describe("work_items constraints", () => {
  it("rejects a reservation without a claimant", async () => {
    const emergency = await createEmergency(db);
    const { workItemIds } = await createWorksite(db, emergency.id);
    await expect(
      db.execute(sql`UPDATE work_items SET claim_expires_at = now() WHERE id = ${workItemIds[0]!}`),
    ).rejects.toThrow();
  });
});
