import { afterAll, describe, expect, it } from "vitest";

import { listUpcomingShifts } from "@/features/shifts/server";
import {
  claimWorkItem,
  listMyWorkItems,
  listWorksiteJobs,
  listWorksitesToHelp,
} from "@/features/work-items/server";

import { createTestDb } from "../setup/db";
import { createEmergency, createShift, createUsers, createWorksite, NOW } from "./fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

const minutesBefore = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

/** Queries issued by `read` against a fresh emergency seeded with `n` rows. */
type Seed = { emergencyId: string; userId: string; worksiteId: string };

async function queriesFor(n: number, read: (seed: Seed) => Promise<unknown>) {
  const seeded = await seed(n);
  counter.reset();
  await read(seeded);
  return counter.count;
}

async function seed(n: number): Promise<Seed> {
  const emergency = await createEmergency(db);
  const [volunteer] = await createUsers(db, emergency.id, 1);
  // n homes waiting for help, and n more with a job the volunteer holds.
  const homes = await Promise.all(
    Array.from({ length: 2 * n }, (_, i) =>
      createWorksite(db, emergency.id, { keys: ["mud", "debris"], unclaimedSince: minutesBefore(i) }),
    ),
  );
  await Promise.all(
    homes.slice(n).map((home) =>
      claimWorkItem(db, {
        emergencyId: emergency.id,
        workItemId: home.workItemIds[0]!,
        userId: volunteer!,
        now: NOW,
      }),
    ),
  );
  await Promise.all(Array.from({ length: n }, () => createShift(db, emergency.id)));
  return { emergencyId: emergency.id, userId: volunteer!, worksiteId: homes[0]!.worksiteId };
}

describe("list queries", () => {
  it("lists homes to help with the same number of queries for 1 and 20 homes", async () => {
    const read = ({ emergencyId }: { emergencyId: string }) =>
      listWorksitesToHelp(db, { emergencyId, locale: "es", origin: { lat: -33.4, lng: -70.5 } });
    expect(await queriesFor(1, read)).toBe(await queriesFor(20, read));
  });

  it("lists a volunteer's jobs with the same number of queries for 1 and 20", async () => {
    const mine = ({ emergencyId, userId }: { emergencyId: string; userId: string }) =>
      listMyWorkItems(db, { emergencyId, userId, locale: "es" });
    expect(await queriesFor(1, mine)).toBe(await queriesFor(20, mine));
  });

  it("lists upcoming shifts with the same number of queries for 1 and 20", async () => {
    const read = ({ emergencyId, userId }: { emergencyId: string; userId: string }) =>
      listUpcomingShifts(db, { emergencyId, userId, locale: "es", now: NOW });
    expect(await queriesFor(1, read)).toBe(await queriesFor(20, read));
  });
});

describe("listWorksitesToHelp", () => {
  it("orders homes by how long they have waited and leaves out the ones somebody is on", async () => {
    const emergency = await createEmergency(db);
    const homes = await Promise.all(
      [30, 10, 50].map((minutes) =>
        createWorksite(db, emergency.id, { unclaimedSince: minutesBefore(minutes) }),
      ),
    );
    // A home somebody is on is not in the list.
    await createWorksite(db, emergency.id, { unclaimedSince: null });

    const first = await listWorksitesToHelp(db, { emergencyId: emergency.id, locale: "en" });
    expect(first.items.map((h) => h.worksiteId)).toEqual(
      [homes[2], homes[0], homes[1]].map((h) => h!.worksiteId),
    );
    expect(first.items[0]?.workItems.map((w) => w.workType)).toEqual(["Mud"]);
    expect(first.items[0]?.distanceMeters).toBeNull();
    expect(first.nextCursor).toBeNull();
  });

  it("shows the distance to the nearest 100 m", async () => {
    const emergency = await createEmergency(db);
    await createWorksite(db, emergency.id, { location: { x: -70.55, y: -33.41 } });
    const page = await listWorksitesToHelp(db, {
      emergencyId: emergency.id,
      locale: "es",
      origin: { lat: -33.4, lng: -70.55 },
    });
    expect((page.items[0]?.distanceMeters ?? 1) % 100).toBe(0);
  });
});

describe("listWorksiteJobs", () => {
  it("tells the viewer which jobs are theirs without naming who holds the rest", async () => {
    const emergency = await createEmergency(db);
    const [me, other] = await createUsers(db, emergency.id, 2);
    const { worksiteId, workItemIds } = await createWorksite(db, emergency.id, { keys: ["mud", "debris"] });
    await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: workItemIds[0]!,
      userId: me!,
      now: NOW,
    });
    await claimWorkItem(db, {
      emergencyId: emergency.id,
      workItemId: workItemIds[1]!,
      userId: other!,
      now: NOW,
    });

    const jobs = await listWorksiteJobs(db, {
      emergencyId: emergency.id,
      worksiteId,
      userId: me!,
      locale: "es",
    });
    expect(jobs.map((j) => [j.isMine, j.isClaimed, j.expiresAt !== null])).toEqual([
      [true, true, true],
      [false, true, false],
    ]);
    expect(Object.keys(jobs[0]!)).not.toContain("claimedBy");
  });
});
