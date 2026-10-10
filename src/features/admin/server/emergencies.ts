import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";
import { TransactionRollbackError } from "drizzle-orm/errors";

import { copySupplyTypeTemplates, copyWorkTypeTemplates } from "@/shared/db/catalog";
import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  postgresErrorOf,
  UNIQUE_VIOLATION,
} from "@/shared/db/errors";
import { adminEvents, emergencies, emergencyNotices, emergencySettings } from "@/shared/db/schema";
import type { Database, Transaction } from "@/shared/db/types";

import type { Result } from "../result";
import type { EmergencyAreaInput, EmergencyInput, EmergencySettingsInput } from "../schemas";

const areaFromGeoJson = (geoJson: string) => sql`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geoJson}), 4326))`;

/** Maps the database's refusals of an emergency write to codes; anything else is a real failure. */
function emergencyWriteError(error: unknown): string {
  const pg = postgresErrorOf(error);
  if (pg?.code === UNIQUE_VIOLATION && pg.constraint === "emergencies_slug_unique") return "slug_taken";
  if (
    pg?.code === FOREIGN_KEY_VIOLATION &&
    pg.constraint === "emergencies_disaster_type_key_disaster_types_key_fk"
  ) {
    return "disaster_type_not_found";
  }
  if (pg?.code === CHECK_VIOLATION && pg.constraint === "emergencies_area_check") return "invalid_area";
  throw error;
}

/** After a conditional UPDATE matched nothing, says why. The UPDATE already decided; this only names it. */
async function whyNotUpdated(tx: Transaction, emergencyId: string) {
  const [row] = await tx
    .select({ status: emergencies.status })
    .from(emergencies)
    .where(eq(emergencies.id, emergencyId));
  if (!row) return "not_found";
  return row.status === "closed" ? "emergency_closed" : "stale_version";
}

/**
 * Opens an emergency: the row, its settings and its own copy of the disaster type's work and
 * supply catalogs, plus the log entry, all or nothing. The id comes from the client, so a retry after a
 * lost response answers success with the slug that was stored, without creating a second one;
 * a retry is recognized by the id alone, whatever else the form changed since.
 */
export async function createEmergency(
  db: Database,
  actorId: string,
  input: EmergencyInput,
): Promise<Result<{ slug: string; created: boolean }>> {
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(emergencies)
        .values({
          id: input.id,
          slug: input.slug,
          disasterTypeKey: input.disasterTypeKey,
          name: input.name,
          defaultLocale: input.defaultLocale,
          timeZone: input.timeZone,
          comunas: input.comunas,
          startedAt: sql`(${input.startedAt}::timestamp AT TIME ZONE ${input.timeZone})`,
          area: input.area ? areaFromGeoJson(input.area) : null,
        })
        // A no-op update on conflict so RETURNING also answers a retry; xmax = 0 only on a fresh insert.
        .onConflictDoUpdate({ target: emergencies.id, set: { id: sql`excluded.id` } })
        .returning({ id: emergencies.id, slug: emergencies.slug, isNew: sql<boolean>`xmax = 0` });
      if (!created) throw new Error("insert returned no row");
      if (!created.isNew) return { ok: true, data: { slug: created.slug, created: false } };

      // An emergency without work types cannot receive a single report.
      if ((await copyWorkTypeTemplates(tx, [created.id])) === 0) tx.rollback();
      await copySupplyTypeTemplates(tx, [created.id]);
      await tx.insert(emergencySettings).values({ emergencyId: created.id });
      await tx.insert(adminEvents).values({
        actorId,
        action: "emergency_created",
        targetType: "emergency",
        targetId: created.id,
        emergencyId: created.id,
        payload: { slug: input.slug, disasterTypeKey: input.disasterTypeKey, hasArea: input.area !== null },
      });
      return { ok: true, data: { slug: input.slug, created: true } };
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError) return { ok: false, code: "empty_work_catalog" };
    return { ok: false, code: emergencyWriteError(error) };
  }
}

/** Saves the caps and notice parameters if nobody saved them since `version` was read. */
export async function updateEmergencySettings(
  db: Database,
  actorId: string,
  { emergencyId, version, ...settings }: EmergencySettingsInput,
): Promise<Result<{ version: number }>> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(emergencySettings)
      .set({ ...settings, version: sql`${emergencySettings.version} + 1` })
      .where(
        and(
          eq(emergencySettings.emergencyId, emergencyId),
          eq(emergencySettings.version, version),
          sql`exists (select 1 from ${emergencies} where ${emergencies.id} = ${emergencyId} and ${emergencies.status} = 'open')`,
        ),
      )
      .returning({ version: emergencySettings.version });
    if (!updated) return { ok: false, code: await whyNotUpdated(tx, emergencyId) };

    await tx.insert(adminEvents).values({
      actorId,
      action: "emergency_settings_updated",
      targetType: "emergency",
      targetId: emergencyId,
      emergencyId,
      // Caps and the survey name only: the official contact stays out of the log.
      payload: {
        version: updated.version,
        smsDailyCap: settings.smsDailyCap,
        whatsappDailyCap: settings.whatsappDailyCap,
        neighborReserve: settings.neighborReserve,
        claimHoldMinutes: settings.claimHoldMinutes,
        officialSurveyName: settings.officialSurveyName,
        // Official numbers (131, 132...), never a person's.
        emergencyNumbers: settings.emergencyNumbers.map((number) => number.phone),
      },
    });
    return { ok: true, data: updated };
  });
}

/** Replaces the area of an open emergency if nobody changed it since `version` was read. */
export async function updateEmergencyArea(
  db: Database,
  actorId: string,
  { emergencyId, version, area }: EmergencyAreaInput,
): Promise<Result<{ version: number }>> {
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(emergencies)
        .set({ area: areaFromGeoJson(area), version: sql`${emergencies.version} + 1` })
        .where(
          and(
            eq(emergencies.id, emergencyId),
            eq(emergencies.version, version),
            eq(emergencies.status, "open"),
          ),
        )
        .returning({ version: emergencies.version });
      if (!updated) return { ok: false, code: await whyNotUpdated(tx, emergencyId) };

      await tx.insert(adminEvents).values({
        actorId,
        action: "emergency_area_updated",
        targetType: "emergency",
        targetId: emergencyId,
        emergencyId,
        payload: { version: updated.version },
      });
      return { ok: true, data: updated };
    });
  } catch (error) {
    return { ok: false, code: emergencyWriteError(error) };
  }
}

/**
 * Closes an open emergency and withdraws its notice, which nobody could take down afterwards.
 * Two admins closing at once: one wins, the other hears `already_closed`.
 */
export async function closeEmergency(
  db: Database,
  actorId: string,
  { emergencyId }: { emergencyId: string },
): Promise<Result<null>> {
  return db.transaction(async (tx) => {
    const [closed] = await tx
      .update(emergencies)
      .set({ status: "closed", closedAt: sql`now()`, version: sql`${emergencies.version} + 1` })
      .where(and(eq(emergencies.id, emergencyId), eq(emergencies.status, "open")))
      .returning({ id: emergencies.id });
    if (!closed) {
      const code = await whyNotUpdated(tx, emergencyId);
      return { ok: false, code: code === "emergency_closed" ? "already_closed" : code };
    }

    const withdrawn = await tx
      .update(emergencyNotices)
      .set({ withdrawnAt: sql`now()` })
      .where(and(eq(emergencyNotices.emergencyId, emergencyId), isNull(emergencyNotices.withdrawnAt)))
      .returning({ id: emergencyNotices.id });

    await tx.insert(adminEvents).values({
      actorId,
      action: "emergency_closed",
      targetType: "emergency",
      targetId: emergencyId,
      emergencyId,
      payload: { withdrawnNoticeId: withdrawn[0]?.id ?? null },
    });
    return { ok: true, data: null };
  });
}
