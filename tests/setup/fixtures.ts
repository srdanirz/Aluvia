import { disasterTypes, emergencies, supplyTypes, workTypes } from "@/shared/db/schema";
import type { Database } from "@/shared/db/types";

export const NOW = new Date("2026-10-10T12:00:00Z");

/** Creates an open emergency with a small invented catalog. Slugs must be unique per test file. */
export async function createEmergency(
  db: Database,
  slug: string,
  { workTypeKeys = ["mud", "water"], supplyTypeKeys = ["shovels", "gloves"] } = {},
) {
  await db
    .insert(disasterTypes)
    .values({ key: "test_flood", name: { es: "Prueba" } })
    .onConflictDoNothing();
  const [emergency] = await db
    .insert(emergencies)
    .values({
      slug,
      disasterTypeKey: "test_flood",
      name: { es: `Emergencia ${slug}`, en: `Emergency ${slug}` },
      defaultLocale: "es",
      timeZone: "America/Santiago",
      startedAt: NOW,
    })
    .returning({ id: emergencies.id });
  if (!emergency) throw new Error("emergency not created");
  if (workTypeKeys.length > 0) {
    await db
      .insert(workTypes)
      .values(
        workTypeKeys.map((key, i) => ({ emergencyId: emergency.id, key, name: { es: key }, sortOrder: i })),
      );
  }
  if (supplyTypeKeys.length > 0) {
    await db
      .insert(supplyTypes)
      .values(
        supplyTypeKeys.map((key, i) => ({ emergencyId: emergency.id, key, name: { es: key }, sortOrder: i })),
      );
  }
  return emergency.id;
}

/** SQLSTATE of the error a write raised; drizzle wraps the driver error in `cause`. */
export async function rejectionCode(write: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
  throw new Error("expected the write to be rejected");
}
