import { randomUUID } from "node:crypto";

import { count, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { newWorksiteSchema } from "@/features/worksites/schemas";
import { createWorksites, listReportedWorksites, REPORTS_PAGE_SIZE } from "@/features/worksites/server";
import { contactViews, reportReceipts, users, worksites } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

let coordinatorId: string;

const home = (overrides: Record<string, unknown> = {}) =>
  newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location: { lng: -70.5 + Math.random() / 100, lat: -33.4 + Math.random() / 100 },
    workTypeKeys: ["mud"],
    ...overrides,
  });

async function addReports(emergencyId: string, worksiteId: string, n: number) {
  await db
    .insert(reportReceipts)
    .values(Array.from({ length: n }, () => ({ id: randomUUID(), emergencyId, worksiteId })));
}

async function setWaitingSince(ids: string[], since: string) {
  await db
    .update(worksites)
    .set({ unclaimedSince: sql`${since}::timestamptz` })
    .where(inArray(worksites.id, ids));
}

const list = (emergencyId: string, cursor: string | null = null, contactViewerId: string | null = null) =>
  listReportedWorksites(db, { emergencyId, locale: "es", now: NOW, cursor, contactViewerId });

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ name: "Coordinadora de prueba" })
    .returning({ id: users.id });
  if (!user) throw new Error("no user");
  coordinatorId = user.id;
});

describe("reported homes list", () => {
  it("puts flagged homes first, then more reports, more open work, longer waiting", async () => {
    const emergencyId = await createEmergency(db, "reports-order");
    const newer = home();
    const older = home();
    const twoJobs = home({ workTypeKeys: ["mud", "water"] });
    const popular = home();
    const danger = home({ isPersonInDanger: true });
    const hazard = home({ hazards: ["gas"] });
    await createWorksites(db, {
      emergencyId,
      source: "neighbor",
      reports: [newer, older, twoJobs, popular, danger, hazard],
    });
    // Receipts: the home's own report plus two attached later.
    await addReports(emergencyId, popular.id, 3);
    await setWaitingSince([older.id], "2026-10-09T08:00:00Z");
    await setWaitingSince([newer.id, twoJobs.id, popular.id, danger.id, hazard.id], "2026-10-10T08:00:00Z");

    const page = await list(emergencyId);
    const ids = page.items.map((item) => item.id);
    expect(ids.slice(0, 2).sort()).toEqual([danger.id, hazard.id].sort());
    expect(ids.slice(2)).toEqual([popular.id, twoJobs.id, older.id, newer.id]);
    expect(page.items.find((item) => item.id === popular.id)?.reportCount).toBe(3);
    expect(page.items.find((item) => item.id === newer.id)?.reportCount).toBe(1);
    expect(page.items.find((item) => item.id === hazard.id)?.level).toBe("do_not_enter");
    expect(page.items.find((item) => item.id === twoJobs.id)?.needs).toEqual(["mud", "water"]);
    expect(page.nextCursor).toBeNull();
  });

  it("leaves out official parcels nobody asked about", async () => {
    const emergencyId = await createEmergency(db, "reports-official");
    const parcel = home({ workTypeKeys: [] });
    const reported = home();
    await createWorksites(db, { emergencyId, source: "official", reports: [parcel] });
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [reported] });

    const page = await list(emergencyId);
    expect(page.items.map((item) => item.id)).toEqual([reported.id]);
  });

  it("shows the public the street without number and a coordinator the logged address", async () => {
    const emergencyId = await createEmergency(db, "reports-address");
    const withAddress = home({ contact: { addressText: "Calle Inventada 123 depto 4" } });
    const withoutAddress = home();
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [withAddress, withoutAddress] });

    const shown = (await list(emergencyId)).items.find((item) => item.id === withAddress.id);
    expect(shown).toMatchObject({ street: "Calle Inventada", addressText: null });
    const [publicViews] = await db
      .select({ n: count() })
      .from(contactViews)
      .where(eq(contactViews.emergencyId, emergencyId));
    expect(publicViews?.n).toBe(0);

    const forCoordinator = await list(emergencyId, null, coordinatorId);
    expect(forCoordinator.items.find((item) => item.id === withAddress.id)?.addressText).toBe(
      "Calle Inventada 123 depto 4",
    );
    const views = await db
      .select({ worksiteId: contactViews.worksiteId, userId: contactViews.userId })
      .from(contactViews)
      .where(eq(contactViews.emergencyId, emergencyId));
    expect(views).toEqual([{ worksiteId: withAddress.id, userId: coordinatorId }]);
  });

  it("pages by cursor without gaps or repeats, in one query per page", async () => {
    const emergencyId = await createEmergency(db, "reports-pages");
    const homes = Array.from({ length: REPORTS_PAGE_SIZE * 2 + 5 }, () =>
      home({ contact: { addressText: "Pasaje Inventado 4" } }),
    );
    // One transaction: equal created_at and unclaimed_since, so only the id breaks ties.
    await createWorksites(db, { emergencyId, source: "neighbor", reports: homes });
    await addReports(emergencyId, homes[0]!.id, 2);

    // Each page depends on the previous cursor, so they are read one after another.
    const readAll = async (viewer: string | null) => {
      const costs: number[] = [];
      const read = async (cursor: string | null) => {
        counter.reset();
        const page = await list(emergencyId, cursor, viewer);
        costs.push(counter.count);
        return page;
      };
      const first = await read(null);
      const second = await read(first.nextCursor);
      const third = await read(second.nextCursor);
      expect(third.nextCursor).toBeNull();
      expect([first, second, third].map((page) => page.items.length)).toEqual([
        REPORTS_PAGE_SIZE,
        REPORTS_PAGE_SIZE,
        5,
      ]);
      return { costs, ids: [first, second, third].flatMap((page) => page.items.map((item) => item.id)) };
    };

    const publicRead = await readAll(null);
    const coordinatorRead = await readAll(coordinatorId);
    for (const { costs, ids } of [publicRead, coordinatorRead]) {
      expect(costs).toEqual([1, 1, 1]);
      expect(new Set(ids).size).toBe(homes.length);
      expect(ids[0]).toBe(homes[0]!.id);
    }
    expect(coordinatorRead.ids).toEqual(publicRead.ids);
    const [views] = await db
      .select({ n: count() })
      .from(contactViews)
      .where(eq(contactViews.emergencyId, emergencyId));
    expect(views?.n).toBe(homes.length);
  });

  it("reads a tampered cursor as the first page", async () => {
    const emergencyId = await createEmergency(db, "reports-tampered");
    const only = home();
    await createWorksites(db, { emergencyId, source: "neighbor", reports: [only] });
    const garbage = await list(emergencyId, "not base64 json");
    const forged = await list(
      emergencyId,
      Buffer.from(
        JSON.stringify({ flag: 1, reports: 1, open: 1, waiting: "x", created: "y", id: "z" }),
      ).toString("base64url"),
    );
    // Shapes JS would parse but Postgres would reject: "1" as a date, a count past int.
    const lenient = await list(
      emergencyId,
      Buffer.from(
        JSON.stringify({
          flag: 1,
          reports: 2 ** 40,
          open: 0,
          waiting: "1",
          created: "May 2",
          id: only.id,
        }),
      ).toString("base64url"),
    );
    expect(garbage.items.map((item) => item.id)).toEqual([only.id]);
    expect(forged.items.map((item) => item.id)).toEqual([only.id]);
    expect(lenient.items.map((item) => item.id)).toEqual([only.id]);
  });
});
