import "server-only";

import { sql } from "drizzle-orm";

import { worksiteUpdates } from "@/shared/db/schema";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import type { WorksiteUpdate } from "../schemas";

export type CreateWorksiteUpdateResult =
  { ok: true; created: boolean } | { ok: false; code: "worksite_not_found" | "invalid_supply_type" };

class InvalidSupplyType extends Error {}

// Postgres SQLSTATE for a foreign key violation: the home is not in this emergency.
const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Appends a field update and its missing supplies in one transaction. Idempotent by the
 * client-generated id: a retry answers `created: false` and writes nothing. Supplies must be
 * active types of the emergency's own catalog, or nothing is written.
 */
export async function createWorksiteUpdate(
  database: Executor,
  {
    emergencyId,
    worksiteId,
    reportedBy,
    update,
  }: { emergencyId: string; worksiteId: string; reportedBy: string | null; update: WorksiteUpdate },
): Promise<CreateWorksiteUpdateResult> {
  try {
    const created = await database.transaction(async (tx) => {
      const inserted = await tx
        .insert(worksiteUpdates)
        .values({ id: update.id, emergencyId, worksiteId, peoplePresent: update.peoplePresent, reportedBy })
        .onConflictDoNothing({ target: worksiteUpdates.id })
        .returning({ id: worksiteUpdates.id });
      if (inserted.length === 0) return false;
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
    return { ok: true, created };
  } catch (error) {
    if (error instanceof InvalidSupplyType) return { ok: false, code: "invalid_supply_type" };
    if ((error as { cause?: { code?: string } }).cause?.code === FOREIGN_KEY_VIOLATION) {
      return { ok: false, code: "worksite_not_found" };
    }
    throw error;
  }
}
