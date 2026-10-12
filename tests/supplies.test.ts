import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { findSupplyBalance } from "@/features/supplies/server";
import { worksites, worksiteUpdates, worksiteUpdateSupplies } from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, NOW } from "./setup/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

// Invented data only (SECURITY.md): an open-ocean point and made-up names.
async function createHome(emergencyId: string) {
  const id = randomUUID();
  await db
    .insert(worksites)
    .values({ id, emergencyId, location: { x: -82.3, y: -42.1 }, source: "neighbor" });
  return id;
}

async function report(
  emergencyId: string,
  worksiteId: string,
  missing: string[],
  { at, cancelled = false }: { at: Date; cancelled?: boolean },
) {
  const id = randomUUID();
  await db.insert(worksiteUpdates).values({
    id,
    emergencyId,
    worksiteId,
    peoplePresent: 1,
    createdAt: at,
    cancelledAt: cancelled ? at : null,
  });
  if (missing.length > 0) {
    await db
      .insert(worksiteUpdateSupplies)
      .values(missing.map((supplyTypeKey) => ({ updateId: id, emergencyId, supplyTypeKey })));
  }
}

async function addPoint(emergencyId: string, surplus: string[], removed = false) {
  await db.execute(sql`
    INSERT INTO collection_points (id, emergency_id, name, location, surplus, removed_at)
    VALUES (gen_random_uuid(), ${emergencyId}, 'Centro inventado', ST_SetSRID(ST_MakePoint(-82.3, -42.1), 4326),
      ARRAY[${sql.join(
        surplus.map((key) => sql`${key}`),
        sql`, `,
      )}]::text[], ${removed ? NOW.toISOString() : null}::timestamptz)`);
}

describe("findSupplyBalance", () => {
  it("counts each home once by its newest update, and active points by what they have spare", async () => {
    const emergencyId = await createEmergency(db, "supplies-balance");
    const [first, second, third] = await Promise.all([
      createHome(emergencyId),
      createHome(emergencyId),
      createHome(emergencyId),
    ]);
    // First: shovels, then corrected to nothing missing; only the newest counts.
    await report(emergencyId, first, ["shovels"], { at: minutesAgo(30) });
    await report(emergencyId, first, [], { at: minutesAgo(10) });
    // Second: shovels and gloves.
    await report(emergencyId, second, ["shovels", "gloves"], { at: minutesAgo(20) });
    // Third: shovels, then a cancelled update that said nothing is missing.
    await report(emergencyId, third, ["shovels"], { at: minutesAgo(20) });
    await report(emergencyId, third, [], { at: minutesAgo(5), cancelled: true });
    await addPoint(emergencyId, ["gloves"]);
    await addPoint(emergencyId, ["gloves"]);
    await addPoint(emergencyId, ["shovels"], true);

    counter.reset();
    const balance = await findSupplyBalance(db, { emergencyId, locale: "es" });
    expect(counter.count).toBe(1);
    expect(balance.missing.map(({ key, missingAt }) => [key, missingAt])).toEqual([
      ["shovels", 2],
      ["gloves", 1],
    ]);
    expect(balance.surplus.map(({ key, surplusAt }) => [key, surplusAt])).toEqual([["gloves", 2]]);
  });

  it("is empty when nobody marked anything", async () => {
    const emergencyId = await createEmergency(db, "supplies-empty");
    expect(await findSupplyBalance(db, { emergencyId, locale: "es" })).toEqual({ missing: [], surplus: [] });
  });
});
