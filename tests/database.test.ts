import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { createTestDb } from "./setup/db";

const { db, counter, close } = createTestDb();
afterAll(close);

describe("test database", () => {
  it("has PostGIS enabled by the migrations", async () => {
    const rows = await db.execute<{ version: string }>(sql`select postgis_version() as version`);
    expect(rows[0]?.version).toMatch(/^3\.5/);
  });

  it("measures distance in meters through geography", async () => {
    // Two points about 111 m apart along a meridian (0.001 degrees of latitude).
    const rows = await db.execute<{ meters: number }>(
      sql`select st_distance(st_makepoint(-70.5, -33.4)::geography, st_makepoint(-70.5, -33.401)::geography) as meters`,
    );
    expect(rows[0]?.meters).toBeGreaterThan(110);
    expect(rows[0]?.meters).toBeLessThan(112);
  });

  it("counts every query it runs", async () => {
    counter.reset();
    await db.execute(sql`select 1`);
    await db.execute(sql`select 2`);
    expect(counter.count).toBe(2);
  });
});
