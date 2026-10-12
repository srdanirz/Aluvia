import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  createCollectionPoint,
  listActiveCollectionPoints,
  removeCollectionPoint,
  updateCollectionPoint,
} from "@/features/collection-points/server/collection-points";
import { purgeEmergencyPersonalData } from "@/shared/db/purge";
import { emergencies, users } from "@/shared/db/schema";
import { eq } from "drizzle-orm";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

// Invented data only (SECURITY.md): open-ocean coordinates, made-up names and a reserved-looking number.
const AT = { lng: -82.3, lat: -42.1 };

async function createActor() {
  const [row] = await db.insert(users).values({ name: "Coordinadora inventada" }).returning({ id: users.id });
  if (!row) throw new Error("user not created");
  return row.id;
}

async function setup(slug: string) {
  const emergencyId = await createEmergency(db, slug);
  const actorId = await createActor();
  return { emergencyId, actorId };
}

function pointInput(
  emergencyId: string,
  actorId: string,
  overrides: Partial<Parameters<typeof createCollectionPoint>[1]> = {},
) {
  return {
    id: randomUUID(),
    emergencyId,
    name: "Gimnasio inventado",
    ...AT,
    address: null,
    openingHours: "9 a 18",
    accepts: ["shovels"],
    phone: "+56900000000",
    actorId,
    ...overrides,
  };
}

describe("collection points", () => {
  it("creates a point once even when the save is retried, and logs it once", async () => {
    const slug = "cp-idempotent";
    const { emergencyId, actorId } = await setup(slug);
    const input = pointInput(emergencyId, actorId);

    expect(await createCollectionPoint(db, input)).toEqual({ ok: true });
    expect(await createCollectionPoint(db, input)).toEqual({ ok: true });

    const { points, supplyTypes } = await listActiveCollectionPoints(db, { slug, locale: "es" });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({
      id: input.id,
      name: "Gimnasio inventado",
      status: "receiving",
      accepts: ["shovels"],
      version: 1,
      lng: AT.lng,
      lat: AT.lat,
    });
    expect(supplyTypes.map((type) => type.key)).toEqual(["shovels", "gloves"]);
    const [logged] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM admin_events WHERE target_id = ${input.id}`,
    );
    expect(logged?.n).toBe(1);
  });

  it("rejects supplies that are not in the emergency's active catalog", async () => {
    const slug = "cp-supplies";
    const { emergencyId, actorId } = await setup(slug);
    const unknown = await createCollectionPoint(
      db,
      pointInput(emergencyId, actorId, { accepts: ["shovels", "pianos"] }),
    );
    expect(unknown).toEqual({ ok: false, code: "invalid_supply_type" });
    expect((await listActiveCollectionPoints(db, { slug, locale: "es" })).points).toEqual([]);

    // A point that took a supply since deactivated can still be edited once that key is dropped.
    const input = pointInput(emergencyId, actorId, { accepts: ["shovels", "gloves"] });
    await createCollectionPoint(db, input);
    await db.execute(
      sql`UPDATE supply_types SET is_active = false WHERE emergency_id = ${emergencyId} AND key = 'gloves'`,
    );
    const change = {
      id: input.id,
      emergencyId,
      version: 1,
      status: "receiving" as const,
      statusNote: null,
      surplus: [],
      actorId,
    };
    expect(await updateCollectionPoint(db, { ...change, accepts: ["shovels", "gloves"] })).toEqual({
      ok: false,
      code: "invalid_supply_type",
    });
    expect(await updateCollectionPoint(db, { ...change, accepts: ["shovels"] })).toEqual({
      ok: true,
      version: 2,
    });
    const { points, supplyTypes } = await listActiveCollectionPoints(db, { slug, locale: "es" });
    expect(points[0]?.accepts).toEqual(["shovels"]);
    expect(supplyTypes.find((type) => type.key === "gloves")?.isActive).toBe(false);
  });

  it("keeps what a point has too much of, checked against the same catalog", async () => {
    const slug = "cp-surplus";
    const { emergencyId, actorId } = await setup(slug);
    const input = pointInput(emergencyId, actorId);
    await createCollectionPoint(db, input);
    const change = {
      id: input.id,
      emergencyId,
      version: 1,
      status: "only_some" as const,
      statusNote: null,
      accepts: ["shovels"],
      actorId,
    };

    expect(await updateCollectionPoint(db, { ...change, surplus: ["gloves", "pianos"] })).toEqual({
      ok: false,
      code: "invalid_supply_type",
    });
    expect(await updateCollectionPoint(db, { ...change, surplus: ["gloves"] })).toEqual({
      ok: true,
      version: 2,
    });
    const { points } = await listActiveCollectionPoints(db, { slug, locale: "es" });
    expect(points[0]).toMatchObject({ accepts: ["shovels"], surplus: ["gloves"] });
  });

  it("does not answer ok for an id that belongs to another emergency", async () => {
    const first = await setup("cp-foreign-a");
    const second = await setup("cp-foreign-b");
    const input = pointInput(first.emergencyId, first.actorId);
    await createCollectionPoint(db, input);
    expect(
      await createCollectionPoint(db, { ...input, emergencyId: second.emergencyId, actorId: second.actorId }),
    ).toEqual({ ok: false, code: "invalid_input" });
    expect((await listActiveCollectionPoints(db, { slug: "cp-foreign-b", locale: "es" })).points).toEqual([]);
  });

  it("changes the status only at the version the coordinator saw", async () => {
    const slug = "cp-version";
    const { emergencyId, actorId } = await setup(slug);
    const input = pointInput(emergencyId, actorId);
    await createCollectionPoint(db, input);
    const change = {
      id: input.id,
      emergencyId,
      version: 1,
      status: "full" as const,
      statusNote: "Sin espacio",
      accepts: [],
      surplus: [],
      actorId,
    };

    // Two coordinators saw version 1 and save at once: the database lets exactly one through.
    const results = await Promise.all([
      updateCollectionPoint(db, change),
      updateCollectionPoint(db, { ...change, status: "only_some" }),
    ]);
    expect(results.filter((result) => result.ok)).toEqual([{ ok: true, version: 2 }]);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, code: "stale_version" }]);

    expect(await updateCollectionPoint(db, change)).toEqual({ ok: false, code: "stale_version" });
    expect(await updateCollectionPoint(db, { ...change, version: 2, accepts: ["pianos"] })).toEqual({
      ok: false,
      code: "invalid_supply_type",
    });
    expect(await updateCollectionPoint(db, { ...change, id: randomUUID() })).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("lists only active points of that emergency, in one query for 1 or 20", async () => {
    const slug = "cp-list";
    const { emergencyId, actorId } = await setup(slug);
    const other = await setup("cp-list-other");
    await createCollectionPoint(db, pointInput(other.emergencyId, other.actorId));
    const removed = pointInput(emergencyId, actorId);
    await createCollectionPoint(db, removed);
    expect(await removeCollectionPoint(db, { id: removed.id, emergencyId, actorId })).toBe(true);
    expect(await removeCollectionPoint(db, { id: removed.id, emergencyId, actorId })).toBe(false);

    await createCollectionPoint(db, pointInput(emergencyId, actorId));
    counter.reset();
    expect((await listActiveCollectionPoints(db, { slug, locale: "es" })).points).toHaveLength(1);
    const forOne = counter.count;

    await db.execute(sql`
      INSERT INTO collection_points (id, emergency_id, name, location, accepts)
      SELECT gen_random_uuid(), ${emergencyId}, 'Centro ' || n, ST_SetSRID(ST_MakePoint(-82.3, -42.1), 4326), '{gloves}'
      FROM generate_series(1, 19) n
    `);
    counter.reset();
    const { points } = await listActiveCollectionPoints(db, { slug, locale: "es" });
    expect(points).toHaveLength(20);
    expect(points.some((point) => point.id === removed.id)).toBe(false);
    expect(counter.count).toBe(forOne);
    expect(forOne).toBe(1);
  });

  it("is empty for a slug that is not an emergency", async () => {
    expect(await listActiveCollectionPoints(db, { slug: "missing", locale: "es" })).toEqual({
      points: [],
      supplyTypes: [],
    });
  });

  it("forgets who created and edited a point, and its phone, when the emergency is purged", async () => {
    const slug = "cp-purge";
    const { emergencyId, actorId } = await setup(slug);
    const input = pointInput(emergencyId, actorId);
    await createCollectionPoint(db, input);
    await updateCollectionPoint(db, {
      id: input.id,
      emergencyId,
      version: 1,
      status: "only_some",
      statusNote: null,
      accepts: ["gloves"],
      surplus: [],
      actorId,
    });
    await db
      .update(emergencies)
      .set({ status: "closed", closedAt: NOW })
      .where(eq(emergencies.id, emergencyId));

    expect((await purgeEmergencyPersonalData(db, emergencyId)).ok).toBe(true);

    const [row] = await db.execute<{
      created_by: string | null;
      updated_by: string | null;
      phone: string | null;
      status: string;
    }>(sql`SELECT created_by, updated_by, phone, status FROM collection_points WHERE id = ${input.id}`);
    expect(row).toEqual({ created_by: null, updated_by: null, phone: null, status: "only_some" });
  });
});
