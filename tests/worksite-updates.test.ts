import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { worksiteUpdateSchema } from "@/features/worksite-updates/schemas";
import {
  createWorksiteUpdate,
  findUpdateForm,
  listCurrentWorksiteUpdates,
} from "@/features/worksite-updates/server";
import { worksiteReportSchema } from "@/features/worksites/schemas";
import { createWorksites } from "@/features/worksites/server";
import { copySupplyTypeTemplates } from "@/shared/db/catalog";
import {
  disasterTypeSupplyTypes,
  disasterTypes,
  emergencies,
  supplyTypes,
  worksiteUpdateSupplies,
  worksiteUpdates,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW, rejectionCode } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

const CHECK_VIOLATION = "23514";

let emergencyId: string;
let otherEmergencyId: string;

async function createHomes(emergency: string, n: number) {
  const reports = Array.from({ length: n }, () =>
    worksiteReportSchema.parse({
      id: randomUUID(),
      locale: "es",
      location: { lng: -70.5, lat: -33.4 },
      workTypeKeys: ["mud"],
    }),
  );
  await createWorksites(db, { emergencyId: emergency, source: "neighbor", reports });
  return reports.map((r) => r.id);
}

const update = (peoplePresent: number, supplyTypeKeys: string[] = []) =>
  worksiteUpdateSchema.parse({ id: randomUUID(), peoplePresent, supplyTypeKeys });

beforeAll(async () => {
  emergencyId = await createEmergency(db, "updates-a");
  otherEmergencyId = await createEmergency(db, "updates-b", { supplyTypeKeys: ["water"] });
});

describe("createWorksiteUpdate", () => {
  it("appends a snapshot with its missing supplies, idempotent by id", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const first = update(4, ["shovels", "gloves"]);
    const input = { emergencyId, worksiteId: home, reportedBy: null, update: first };
    expect(await createWorksiteUpdate(db, input)).toEqual({ ok: true, created: true });
    expect(await createWorksiteUpdate(db, input)).toEqual({ ok: true, created: false });

    const supplies = await db
      .select({ key: worksiteUpdateSupplies.supplyTypeKey })
      .from(worksiteUpdateSupplies)
      .where(eq(worksiteUpdateSupplies.updateId, first.id));
    expect(supplies.map((s) => s.key).sort()).toEqual(["gloves", "shovels"]);
  });

  it("writes nothing for an unknown or inactive supply, or a home of another emergency", async () => {
    const [home] = await createHomes(emergencyId, 1);
    const [foreignHome] = await createHomes(otherEmergencyId, 1);
    if (!home || !foreignHome) throw new Error("no home");
    await db.update(supplyTypes).set({ isActive: false }).where(eq(supplyTypes.key, "gloves"));

    const bad = update(2, ["shovels", "gloves"]);
    expect(
      await createWorksiteUpdate(db, { emergencyId, worksiteId: home, reportedBy: null, update: bad }),
    ).toEqual({
      ok: false,
      code: "invalid_supply_type",
    });
    expect(await db.select().from(worksiteUpdates).where(eq(worksiteUpdates.id, bad.id))).toEqual([]);

    expect(
      await createWorksiteUpdate(db, {
        emergencyId,
        worksiteId: foreignHome,
        reportedBy: null,
        update: update(1),
      }),
    ).toEqual({ ok: false, code: "worksite_not_found" });
    await db.update(supplyTypes).set({ isActive: true }).where(eq(supplyTypes.key, "gloves"));
  });

  it("rejects an impossible head count in the database too", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const code = await rejectionCode(
      db
        .insert(worksiteUpdates)
        .values({ id: randomUUID(), emergencyId, worksiteId: home, peoplePresent: 5000 }),
    );
    expect(code).toBe(CHECK_VIOLATION);
    expect(
      worksiteUpdateSchema.safeParse({ id: randomUUID(), peoplePresent: -1, supplyTypeKeys: [] }).success,
    ).toBe(false);
  });
});

describe("current state", () => {
  it("is the newest update that was not cancelled", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const older = update(3, ["shovels"]);
    const newer = update(9, []);
    await createWorksiteUpdate(db, { emergencyId, worksiteId: home, reportedBy: null, update: older });
    await createWorksiteUpdate(db, { emergencyId, worksiteId: home, reportedBy: null, update: newer });
    await db
      .update(worksiteUpdates)
      .set({ createdAt: new Date(NOW.getTime() - 60_000) })
      .where(eq(worksiteUpdates.id, older.id));
    await db.update(worksiteUpdates).set({ createdAt: NOW }).where(eq(worksiteUpdates.id, newer.id));

    expect(await listCurrentWorksiteUpdates([home], db)).toMatchObject([
      { worksiteId: home, peoplePresent: 9, missingSupplyKeys: [] },
    ]);

    await db.update(worksiteUpdates).set({ cancelledAt: NOW }).where(eq(worksiteUpdates.id, newer.id));
    expect(await listCurrentWorksiteUpdates([home], db)).toMatchObject([
      { worksiteId: home, peoplePresent: 3, missingSupplyKeys: ["shovels"] },
    ]);
  });

  it("costs one query for 1 home and for 20", async () => {
    const homes = await createHomes(emergencyId, 20);
    await Promise.all(
      homes.map((home) =>
        createWorksiteUpdate(db, {
          emergencyId,
          worksiteId: home,
          reportedBy: null,
          update: update(2, ["gloves"]),
        }),
      ),
    );
    counter.reset();
    expect(await listCurrentWorksiteUpdates(homes.slice(0, 1), db)).toHaveLength(1);
    const one = counter.count;
    counter.reset();
    expect(await listCurrentWorksiteUpdates(homes, db)).toHaveLength(20);
    expect(counter.count).toBe(one);
  });

  it("loads the update screen in one query", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    await createWorksiteUpdate(db, {
      emergencyId,
      worksiteId: home,
      reportedBy: null,
      update: update(5, ["shovels"]),
    });
    counter.reset();
    const form = await findUpdateForm({ slug: "updates-a", worksiteId: home, locale: "es" }, db);
    expect(counter.count).toBe(1);
    expect(form?.supplyTypes.map((s) => s.key)).toEqual(["shovels", "gloves"]);
    expect(form?.current).toMatchObject({ peoplePresent: 5, missingSupplyKeys: ["shovels"] });
    expect(await findUpdateForm({ slug: "updates-b", worksiteId: home, locale: "es" }, db)).toBeNull();
  });
});

describe("supply catalog template", () => {
  it("copies the disaster type's supplies into a new emergency's catalog", async () => {
    await db.insert(disasterTypes).values({ key: "test_fire", name: { es: "Incendio" } });
    await db.insert(disasterTypeSupplyTypes).values([
      { disasterTypeKey: "test_fire", key: "masks", name: { es: "Mascarillas" }, sortOrder: 0 },
      { disasterTypeKey: "test_fire", key: "tarps", name: { es: "Lonas" }, sortOrder: 1 },
    ]);
    const [emergency] = await db
      .insert(emergencies)
      .values({
        slug: "updates-fire",
        disasterTypeKey: "test_fire",
        name: { es: "Incendio" },
        defaultLocale: "es",
        timeZone: "America/Santiago",
        startedAt: NOW,
      })
      .returning({ id: emergencies.id });
    if (!emergency) throw new Error("no emergency");
    expect(await copySupplyTypeTemplates(db, [emergency.id])).toBe(2);
    const rows = await db
      .select({ key: supplyTypes.key })
      .from(supplyTypes)
      .where(eq(supplyTypes.emergencyId, emergency.id));
    expect(rows.map((r) => r.key).sort()).toEqual(["masks", "tarps"]);
  });
});
