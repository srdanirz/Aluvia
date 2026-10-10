import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { worksiteUpdateSchema } from "@/features/worksite-updates/schemas";
import { createWorksiteUpdate } from "@/features/worksite-updates/server";
import { newWorksiteSchema } from "@/features/worksites/schemas";
import { createWorksites } from "@/features/worksites/server";
import {
  emergencies,
  supplyTypes,
  workItems,
  workTypes,
  worksiteUpdates,
  worksites,
} from "@/shared/db/schema";

import { createTestDb } from "./setup/db";
import { createEmergency, rejectionCode } from "./setup/fixtures";

const FOREIGN_KEY_VIOLATION = "23503";

const { db, close } = createTestDb();
afterAll(close);

async function emergencyWithData(slug: string) {
  const emergencyId = await createEmergency(db, slug);
  const home = newWorksiteSchema.parse({
    id: randomUUID(),
    locale: "es",
    location: { lng: -70.5, lat: -33.4 },
    workTypeKeys: ["mud", "water"],
    contact: { addressText: "Calle Inventada 1" },
  });
  await createWorksites(db, { emergencyId, source: "neighbor", reports: [home] });
  await createWorksiteUpdate(db, {
    emergencyId,
    worksiteId: home.id,
    reportedBy: null,
    update: worksiteUpdateSchema.parse({ id: randomUUID(), peoplePresent: 3, supplyTypeKeys: ["shovels"] }),
  });
  return emergencyId;
}

describe("deleting an emergency", () => {
  // Catalog FKs refuse deleting a used type, but must not block the cascade from the emergency,
  // whatever order Postgres visits the child tables in.
  it("takes its homes, work, contacts and field updates with it", async () => {
    const emergencyId = await emergencyWithData("delete-me");

    await db.delete(emergencies).where(eq(emergencies.id, emergencyId));

    const counts = await Promise.all(
      [worksites, workItems, worksiteUpdates].map((table) =>
        db.select({ n: count() }).from(table).where(eq(table.emergencyId, emergencyId)),
      ),
    );
    expect(counts.map(([row]) => row?.n)).toEqual([0, 0, 0]);
  });

  it("still refuses deleting a work or supply type in use", async () => {
    const emergencyId = await emergencyWithData("keep-types");
    expect(
      await rejectionCode(
        db.delete(workTypes).where(and(eq(workTypes.emergencyId, emergencyId), eq(workTypes.key, "mud"))),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
    expect(
      await rejectionCode(
        db
          .delete(supplyTypes)
          .where(and(eq(supplyTypes.emergencyId, emergencyId), eq(supplyTypes.key, "shovels"))),
      ),
    ).toBe(FOREIGN_KEY_VIOLATION);
  });
});
