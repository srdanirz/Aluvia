import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { worksiteUpdateSchema } from "@/features/worksite-updates/schemas";
import {
  cancelWorksiteUpdate,
  createWorksiteUpdate,
  findUpdateForm,
  listCurrentWorksiteUpdates,
  listWorksiteUpdateHistory,
} from "@/features/worksite-updates/server";
import { FIELD_WRITE_LIMITS, hitFieldWriteLimit } from "@/shared/anonymous-actor";
import { worksiteReportSchema } from "@/features/worksites/schemas";
import { createWorksites } from "@/features/worksites/server";
import { copySupplyTypeTemplates } from "@/shared/db/catalog";
import {
  disasterTypeSupplyTypes,
  disasterTypes,
  emergencies,
  emergencyMembers,
  supplyTypes,
  users,
  worksiteUpdateSupplies,
  worksiteUpdates,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW, rejectionCode } from "./setup/fixtures";

const RACERS = 6;
const { db, counter, close } = createTestDb({ connections: RACERS + 2 });
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

async function createMember(emergency: string, role: "volunteer" | "coordinator") {
  const [user] = await db.insert(users).values({ name: "Persona de prueba" }).returning({ id: users.id });
  if (!user) throw new Error("no user");
  await db.insert(emergencyMembers).values({
    emergencyId: emergency,
    userId: user.id,
    role,
    approvedAt: role === "coordinator" ? NOW : null,
  });
  return user.id;
}

const anonymous = (tag: string) => ({ deviceKey: `device-${tag}`, ipKey: `ip-${tag}` });

// ADR 0018: anyone updates any home of an open emergency, without an account or an assignment.
describe("open updates", () => {
  it("records an anonymous update with its device and IP keys, never a person", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const first = { ...update(3, ["shovels"]), previousUpdateId: null };
    expect(
      await createWorksiteUpdate(db, {
        emergencyId,
        worksiteId: home,
        reportedBy: null,
        actor: anonymous("a"),
        update: first,
      }),
    ).toEqual({ ok: true, created: true });
    const [row] = await db.select().from(worksiteUpdates).where(eq(worksiteUpdates.id, first.id));
    expect(row).toMatchObject({
      reportedBy: null,
      deviceKey: "device-a",
      ipKey: "ip-a",
      previousUpdateId: null,
    });
    expect(await listWorksiteUpdateHistory(db, { emergencyId, worksiteId: home })).toMatchObject([
      { id: first.id, peoplePresent: 3, isMember: false, deviceTag: "device", isCancelled: false },
    ]);
  });

  it("refuses an update based on a state that changed meanwhile", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const send = (body: ReturnType<typeof update> & { previousUpdateId: string | null }) =>
      createWorksiteUpdate(db, {
        emergencyId,
        worksiteId: home,
        reportedBy: null,
        actor: anonymous("b"),
        update: body,
      });
    const first = { ...update(2), previousUpdateId: null };
    expect(await send(first)).toEqual({ ok: true, created: true });
    // A retry of the same id is still a retry, not a stale write.
    expect(await send(first)).toEqual({ ok: true, created: false });
    expect(await send({ ...update(5), previousUpdateId: null })).toEqual({
      ok: false,
      code: "stale_version",
    });
    expect(await send({ ...update(5), previousUpdateId: first.id })).toEqual({ ok: true, created: true });
  });

  it("accepts exactly one of many concurrent updates based on the same state", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const results = await Promise.all(
      Array.from({ length: RACERS }, (_, i) =>
        createWorksiteUpdate(db, {
          emergencyId,
          worksiteId: home,
          reportedBy: null,
          actor: anonymous(`race-${i}`),
          update: { ...update(i), previousUpdateId: null },
        }),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === "stale_version")).toHaveLength(RACERS - 1);
  });

  it("refuses updates once the emergency closes", async () => {
    const closed = await createEmergency(db, "updates-closed");
    const [home] = await createHomes(closed, 1);
    if (!home) throw new Error("no home");
    await db.update(emergencies).set({ status: "closed", closedAt: NOW }).where(eq(emergencies.id, closed));
    expect(
      await createWorksiteUpdate(db, {
        emergencyId: closed,
        worksiteId: home,
        reportedBy: null,
        update: update(1),
      }),
    ).toEqual({ ok: false, code: "worksite_not_found" });
  });

  it("rate-limits per device, and per IP across devices", async () => {
    const device = anonymous("limited");
    const hits = await Array.from({ length: FIELD_WRITE_LIMITS.perDevice + 1 }).reduce<Promise<boolean[]>>(
      async (previous) => [...(await previous), await hitFieldWriteLimit(db, device)],
      Promise.resolve([]),
    );
    expect(hits.slice(0, FIELD_WRITE_LIMITS.perDevice).every(Boolean)).toBe(true);
    expect(hits.at(-1)).toBe(false);
    // Another device on the same network still has its own budget, until the network's runs out.
    expect(await hitFieldWriteLimit(db, { deviceKey: "device-other", ipKey: device.ipKey })).toBe(true);
    await db.execute(sql`
      UPDATE rate_limits SET hits = ${FIELD_WRITE_LIMITS.perIp} WHERE key = ${`field_write:ip:${device.ipKey}`}`);
    expect(await hitFieldWriteLimit(db, { deviceKey: "device-third", ipKey: device.ipKey })).toBe(false);
  });
});

describe("history and hiding", () => {
  it("lets a coordinator hide an update so the home falls back, and nobody else", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    const coordinator = await createMember(emergencyId, "coordinator");
    const volunteer = await createMember(emergencyId, "volunteer");
    const good = { ...update(4), previousUpdateId: null };
    const abusive = { ...update(400), previousUpdateId: good.id };
    await createWorksiteUpdate(db, { emergencyId, worksiteId: home, reportedBy: volunteer, update: good });
    await createWorksiteUpdate(db, {
      emergencyId,
      worksiteId: home,
      reportedBy: null,
      actor: anonymous("abuse"),
      update: abusive,
    });

    expect(await cancelWorksiteUpdate(db, { emergencyId, updateId: abusive.id, userId: volunteer })).toEqual({
      ok: false,
      code: "forbidden",
    });
    expect(
      await cancelWorksiteUpdate(db, {
        emergencyId: otherEmergencyId,
        updateId: abusive.id,
        userId: coordinator,
      }),
    ).toEqual({ ok: false, code: "forbidden" });
    expect(
      await cancelWorksiteUpdate(db, { emergencyId, updateId: abusive.id, userId: coordinator }),
    ).toEqual({
      ok: true,
    });
    expect(
      await cancelWorksiteUpdate(db, { emergencyId, updateId: abusive.id, userId: coordinator }),
    ).toEqual({
      ok: true,
    });
    expect(await listCurrentWorksiteUpdates([home], db)).toMatchObject([{ id: good.id, peoplePresent: 4 }]);
    expect(await listWorksiteUpdateHistory(db, { emergencyId, worksiteId: home })).toMatchObject([
      { id: abusive.id, isCancelled: true, isMember: false },
      { id: good.id, isCancelled: false, isMember: true, deviceTag: null },
    ]);
  });

  it("lists a home's history in one query for 1 update and for 20", async () => {
    const [home] = await createHomes(emergencyId, 1);
    if (!home) throw new Error("no home");
    await createWorksiteUpdate(db, {
      emergencyId,
      worksiteId: home,
      reportedBy: null,
      update: update(1, ["gloves"]),
    });
    counter.reset();
    expect(await listWorksiteUpdateHistory(db, { emergencyId, worksiteId: home })).toHaveLength(1);
    const one = counter.count;
    await Promise.all(
      Array.from({ length: 19 }, () =>
        createWorksiteUpdate(db, {
          emergencyId,
          worksiteId: home,
          reportedBy: null,
          update: update(2, ["gloves"]),
        }),
      ),
    );
    counter.reset();
    expect(await listWorksiteUpdateHistory(db, { emergencyId, worksiteId: home })).toHaveLength(20);
    expect(counter.count).toBe(one);
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
