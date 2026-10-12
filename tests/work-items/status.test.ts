import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  claimWorkItem,
  markWorkItemStatus,
  revertWorkItemStatus,
  verifyWorkItem,
} from "@/features/work-items/server";
import {
  emergencies,
  emergencyMembers,
  users,
  workItemEvents,
  workItems,
  worksites,
} from "@/shared/db/schema";

import { createTestDb } from "../setup/db";
import { createEmergency, createUsers, createWorksite, NOW, outboxFor } from "./fixtures";

const RACERS = 6;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

async function readItem(id: string) {
  const [item] = await db.select().from(workItems).where(eq(workItems.id, id));
  if (!item) throw new Error("work item missing");
  return item;
}

/** A home with one job claimed by a volunteer, and a coordinator of the same emergency. */
async function claimedJob() {
  const emergency = await createEmergency(db);
  const [volunteer, bystander] = await createUsers(db, emergency.id, 2);
  const [coordinator] = await createUsers(db, emergency.id, 1, "coordinator");
  const { worksiteId, workItemIds } = await createWorksite(db, emergency.id);
  const workItemId = workItemIds[0]!;
  await claimWorkItem(db, { emergencyId: emergency.id, workItemId, userId: volunteer!, now: NOW });
  const { version } = await readItem(workItemId);
  return {
    emergencyId: emergency.id,
    worksiteId,
    workItemId,
    volunteer: volunteer!,
    bystander: bystander!,
    coordinator: coordinator!,
    version,
  };
}

describe("markWorkItemStatus", () => {
  it("lets the claimant close the job and keeps their credit", async () => {
    const job = await claimedJob();
    const result = await markWorkItemStatus(db, {
      ...job,
      userId: job.volunteer,
      status: "closed_done",
      now: NOW,
    });
    expect(result).toEqual({ ok: true, data: { workTypeKeys: ["mud"], isCoordinator: false } });
    expect(await readItem(job.workItemId)).toMatchObject({
      status: "closed_done",
      claimedBy: job.volunteer,
      claimExpiresAt: null,
    });
  });

  it("keeps the claim on partial progress and stops its expiry", async () => {
    const job = await claimedJob();
    await markWorkItemStatus(db, { ...job, userId: job.volunteer, status: "open_partially_done", now: NOW });
    expect(await readItem(job.workItemId)).toMatchObject({
      status: "open_partially_done",
      claimedBy: job.volunteer,
      claimExpiresAt: null,
    });
  });

  it("turns the home red again on needs follow-up and tells its coordinators", async () => {
    const job = await claimedJob();
    await markWorkItemStatus(db, { ...job, userId: job.volunteer, status: "open_needs_follow_up", now: NOW });

    expect(await readItem(job.workItemId)).toMatchObject({ status: "open_needs_follow_up", claimedBy: null });
    const [home] = await db.select().from(worksites).where(eq(worksites.id, job.worksiteId));
    expect(home?.unclaimedSince).toEqual(NOW);
    const notices = await outboxFor(db, `work_item_needs_follow_up:${job.workItemId}:${job.version + 1}`);
    expect(notices.map((n) => n.user_id)).toEqual([job.coordinator]);
  });

  // ADR 0018: anyone updates a job's status, signed in or not; duplicates stay with coordinators.
  it("lets anyone change an open job, without an account too, and records the anonymous actor", async () => {
    const job = await claimedJob();
    expect(
      await markWorkItemStatus(db, {
        ...job,
        userId: job.bystander,
        status: "open_partially_done",
        now: NOW,
      }),
    ).toMatchObject({ ok: true, data: { isCoordinator: false } });

    const other = await claimedJob();
    const actor = { deviceKey: "device-key-a", ipKey: "ip-key-a" };
    expect(
      await markWorkItemStatus(db, { ...other, userId: null, actor, status: "closed_done", now: NOW }),
    ).toMatchObject({ ok: true, data: { isCoordinator: false } });
    expect(await readItem(other.workItemId)).toMatchObject({ status: "closed_done" });
    const events = await db
      .select()
      .from(workItemEvents)
      .where(eq(workItemEvents.workItemId, other.workItemId));
    expect(events.at(-1)).toMatchObject({
      kind: "status_changed",
      toStatus: "closed_done",
      actorId: null,
      deviceKey: "device-key-a",
      ipKey: "ip-key-a",
    });
  });

  it("keeps closed_duplicate for coordinators and refuses a stale anonymous change", async () => {
    const job = await claimedJob();
    expect(
      await markWorkItemStatus(db, { ...job, userId: job.volunteer, status: "closed_duplicate", now: NOW }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await markWorkItemStatus(db, { ...job, userId: null, status: "closed_duplicate", now: NOW }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await markWorkItemStatus(db, {
        ...job,
        version: job.version + 5,
        userId: null,
        status: "closed_done",
        now: NOW,
      }),
    ).toEqual({ ok: false, code: "stale_version" });
  });

  it("lets a coordinator change any open job, but never over a newer version", async () => {
    const job = await claimedJob();
    expect(
      await markWorkItemStatus(db, { ...job, userId: job.coordinator, status: "closed_duplicate", now: NOW }),
    ).toMatchObject({ ok: true, data: { isCoordinator: true } });
    expect(
      await markWorkItemStatus(db, { ...job, userId: job.coordinator, status: "closed_done", now: NOW }),
    ).toEqual({ ok: false, code: "not_open" });

    const other = await claimedJob();
    await markWorkItemStatus(db, {
      ...other,
      userId: other.volunteer,
      status: "open_partially_done",
      now: NOW,
    });
    expect(
      await markWorkItemStatus(db, { ...other, userId: other.coordinator, status: "closed_done", now: NOW }),
    ).toEqual({ ok: false, code: "stale_version" });
  });

  it("applies exactly one of many concurrent changes made from the same version", async () => {
    const job = await claimedJob();
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        markWorkItemStatus(db, {
          ...job,
          userId: i % 2 === 0 ? job.volunteer : job.coordinator,
          status: i % 2 === 0 ? "closed_done" : "open_needs_follow_up",
          now: NOW,
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect((await readItem(job.workItemId)).version).toBe(job.version + 1);
  });
});

describe("a coordinator's report from afar", () => {
  it("leaves the volunteer's hold and arrival untouched", async () => {
    const job = await claimedJob();
    const before = await readItem(job.workItemId);
    await markWorkItemStatus(db, {
      ...job,
      userId: job.coordinator,
      status: "open_partially_done",
      now: NOW,
    });
    expect(await readItem(job.workItemId)).toMatchObject({
      status: "open_partially_done",
      claimedBy: job.volunteer,
      arrivedAt: null,
      claimExpiresAt: before.claimExpiresAt,
    });
  });

  it("changes nothing once the emergency is closed", async () => {
    const job = await claimedJob();
    await db
      .update(emergencies)
      .set({ status: "closed", closedAt: NOW })
      .where(eq(emergencies.id, job.emergencyId));
    expect(
      await markWorkItemStatus(db, { ...job, userId: job.volunteer, status: "closed_done", now: NOW }),
    ).toEqual({ ok: false, code: "emergency_closed" });
  });
});

describe("work_item_events", () => {
  it("is append-only but lets a deleted user's name go and an emergency be removed", async () => {
    const job = await claimedJob();
    await expect(
      db
        .update(workItemEvents)
        .set({ toStatus: "closed_done" })
        .where(eq(workItemEvents.workItemId, job.workItemId)),
    ).rejects.toThrow();
    await expect(
      db.delete(workItemEvents).where(eq(workItemEvents.workItemId, job.workItemId)),
    ).rejects.toThrow();
    await db
      .update(workItems)
      .set({ claimedBy: null, claimExpiresAt: null })
      .where(eq(workItems.id, job.workItemId));
    await db.delete(users).where(eq(users.id, job.volunteer));
    const [event] = await db
      .select()
      .from(workItemEvents)
      .where(eq(workItemEvents.workItemId, job.workItemId));
    expect(event?.actorId).toBeNull();
    await db.delete(emergencies).where(eq(emergencies.id, job.emergencyId));
    expect(
      await db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, job.workItemId)),
    ).toEqual([]);
  });
});

describe("coordinator approval", () => {
  it("gives nothing to someone whose coordinator request is still pending", async () => {
    const job = await claimedJob();
    const [pending] = await createUsers(db, job.emergencyId, 1, "volunteer");
    // A pending request grants nothing (feat/auth): the role stays volunteer until approved.
    await db
      .update(emergencyMembers)
      .set({ requestedRole: "coordinator" })
      .where(eq(emergencyMembers.userId, pending!));
    expect(await verifyWorkItem(db, { ...job, userId: pending!, now: NOW })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await markWorkItemStatus(db, { ...job, userId: pending!, status: "closed_duplicate", now: NOW }),
    ).toEqual({ ok: false, code: "forbidden" });
  });
});

describe("verifyWorkItem", () => {
  it("is for coordinators only and records who verified", async () => {
    const job = await claimedJob();
    expect(await verifyWorkItem(db, { ...job, userId: job.volunteer, now: NOW })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(await verifyWorkItem(db, { ...job, userId: job.coordinator, now: NOW })).toEqual({
      ok: true,
      data: null,
    });
    expect(await readItem(job.workItemId)).toMatchObject({ verifiedBy: job.coordinator, verifiedAt: NOW });

    // A later change is a status nobody verified yet.
    await markWorkItemStatus(db, {
      ...job,
      version: job.version + 1,
      userId: job.volunteer,
      status: "closed_done",
      now: NOW,
    });
    expect(await readItem(job.workItemId)).toMatchObject({
      status: "closed_done",
      verifiedBy: null,
      verifiedAt: null,
    });
  });
});

describe("revertWorkItemStatus", () => {
  it("lets a coordinator undo an anonymous closing, and nobody else", async () => {
    const job = await claimedJob();
    await markWorkItemStatus(db, { ...job, userId: null, status: "closed_no_help_wanted", now: NOW });
    const version = job.version + 1;

    expect(await revertWorkItemStatus(db, { ...job, version, userId: job.volunteer, now: NOW })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await revertWorkItemStatus(db, { ...job, version: job.version, userId: job.coordinator, now: NOW }),
    ).toEqual({
      ok: false,
      code: "stale_version",
    });
    expect(await revertWorkItemStatus(db, { ...job, version, userId: job.coordinator, now: NOW })).toEqual({
      ok: true,
      data: null,
    });
    expect(await readItem(job.workItemId)).toMatchObject({
      status: "open_claimed",
      claimedBy: job.volunteer,
      version: version + 1,
    });
    const events = await db
      .select()
      .from(workItemEvents)
      .where(eq(workItemEvents.workItemId, job.workItemId));
    expect(events.at(-1)).toMatchObject({
      kind: "status_reverted",
      fromStatus: "closed_no_help_wanted",
      toStatus: "open_claimed",
      actorId: job.coordinator,
    });
    // An undo is not undone again: the newest event is no longer a status change.
    expect(
      await revertWorkItemStatus(db, { ...job, version: version + 1, userId: job.coordinator, now: NOW }),
    ).toEqual({ ok: false, code: "nothing_to_revert" });
  });

  it("falls back to unclaimed when the undone change had given the claim back", async () => {
    const job = await claimedJob();
    await markWorkItemStatus(db, { ...job, userId: null, status: "open_needs_follow_up", now: NOW });
    expect(
      await revertWorkItemStatus(db, { ...job, version: job.version + 1, userId: job.coordinator, now: NOW }),
    ).toEqual({ ok: true, data: null });
    expect(await readItem(job.workItemId)).toMatchObject({ status: "open_unclaimed", claimedBy: null });
  });
});

describe("marking a whole home", () => {
  it("closes every listed job at once", async () => {
    const emergency = await createEmergency(db);
    const { workItemIds } = await createWorksite(db, emergency.id, { keys: ["mud", "debris"] });
    const items = workItemIds.map((workItemId) => ({ workItemId, version: 0 }));

    const result = await markWorkItemStatus(db, {
      emergencyId: emergency.id,
      items,
      userId: null,
      status: "closed_done",
      now: NOW,
    });

    expect(result.ok && [...result.data.workTypeKeys].sort()).toEqual(["debris", "mud"]);
    const rows = await db
      .select({ status: workItems.status })
      .from(workItems)
      .where(inArray(workItems.id, workItemIds));
    expect(rows.map((row) => row.status)).toEqual(["closed_done", "closed_done"]);
  });

  it("changes nothing when one job moved since it was shown", async () => {
    const emergency = await createEmergency(db);
    const { workItemIds } = await createWorksite(db, emergency.id, { keys: ["mud", "debris"] });
    const [first, second] = workItemIds;
    await markWorkItemStatus(db, {
      emergencyId: emergency.id,
      workItemId: second!,
      version: 0,
      userId: null,
      status: "open_partially_done",
      now: NOW,
    });

    const result = await markWorkItemStatus(db, {
      emergencyId: emergency.id,
      items: [
        { workItemId: first!, version: 0 },
        { workItemId: second!, version: 0 },
      ],
      userId: null,
      status: "closed_done",
      now: NOW,
    });

    expect(result).toEqual({ ok: false, code: "stale_version" });
    const [row] = await db
      .select({ status: workItems.status })
      .from(workItems)
      .where(eq(workItems.id, first!));
    expect(row?.status).toBe("open_unclaimed");
  });
});
