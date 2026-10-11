import "server-only";

import { sql } from "drizzle-orm";

import type { ActorKeys } from "@/shared/anonymous-actor";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import type { WorksiteUpdate } from "../schemas";

export type CreateWorksiteUpdateResult =
  | { ok: true; created: boolean }
  | { ok: false; code: "worksite_not_found" | "invalid_supply_type" | "stale_version" };

class InvalidSupplyType extends Error {}
class StaleVersion extends Error {}

/**
 * Appends a field update and its missing supplies in one transaction (ADR 0018: anyone may send
 * one, signed in or not). Idempotent by the client-generated id: a retry answers `created: false`
 * and writes nothing. Refused as `stale_version` when the home's live update is no longer the one
 * the sender saw, and as `worksite_not_found` when the home is not in this open emergency.
 * Supplies must be active types of the emergency's own catalog, or nothing is written.
 */
export async function createWorksiteUpdate(
  database: Executor,
  {
    emergencyId,
    worksiteId,
    reportedBy,
    actor,
    update,
  }: {
    emergencyId: string;
    worksiteId: string;
    reportedBy: string | null;
    actor?: ActorKeys | null;
    update: WorksiteUpdate;
  },
): Promise<CreateWorksiteUpdateResult> {
  try {
    const created = await database.transaction(async (tx) => {
      // The home's row lock serializes writers of one home, so the "live update" each of them
      // compares against is the one the previous writer committed.
      const home = await tx.execute(sql`
        SELECT 1 FROM worksites w
        JOIN emergencies e ON e.id = w.emergency_id AND e.status = 'open'
        WHERE w.id = ${worksiteId}::uuid AND w.emergency_id = ${emergencyId}::uuid
        FOR UPDATE OF w`);
      if (home.length === 0) return null;

      const checksVersion = update.previousUpdateId !== undefined;
      const inserted = await tx.execute<{ id: string }>(sql`
        INSERT INTO worksite_updates
          (id, emergency_id, worksite_id, people_present, reported_by, previous_update_id, device_key, ip_key)
        SELECT ${update.id}::uuid, ${emergencyId}::uuid, ${worksiteId}::uuid, ${update.peoplePresent},
          ${reportedBy}::uuid, ${update.previousUpdateId ?? null}::uuid, ${actor?.deviceKey ?? null},
          ${actor?.ipKey ?? null}
        WHERE NOT ${checksVersion} OR (
          SELECT u.id FROM worksite_updates u
          WHERE u.worksite_id = ${worksiteId}::uuid AND u.cancelled_at IS NULL
          ORDER BY u.created_at DESC, u.id DESC LIMIT 1
        ) IS NOT DISTINCT FROM ${update.previousUpdateId ?? null}::uuid
        ON CONFLICT (id) DO NOTHING
        RETURNING id`);
      if (inserted.length === 0) {
        const retry = await tx.execute(sql`SELECT 1 FROM worksite_updates WHERE id = ${update.id}::uuid`);
        if (retry.length > 0) return false;
        throw new StaleVersion();
      }
      if (update.supplyTypeKeys.length === 0) return true;

      const supplies = await tx.execute<{ key: string }>(sql`
        INSERT INTO worksite_update_supplies (update_id, emergency_id, supply_type_key)
        SELECT ${update.id}, ${emergencyId}, st.key
        FROM supply_types st
        WHERE st.emergency_id = ${emergencyId}
          AND st.is_active
          AND st.key = ANY(${sqlArray(update.supplyTypeKeys, "text")})
        RETURNING supply_type_key AS key
      `);
      if (supplies.length !== update.supplyTypeKeys.length) throw new InvalidSupplyType();
      return true;
    });
    if (created === null) return { ok: false, code: "worksite_not_found" };
    return { ok: true, created };
  } catch (error) {
    if (error instanceof InvalidSupplyType) return { ok: false, code: "invalid_supply_type" };
    if (error instanceof StaleVersion) return { ok: false, code: "stale_version" };
    throw error;
  }
}
