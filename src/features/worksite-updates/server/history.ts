import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

/**
 * A home's update history for its coordinators (ADR 0018), and hiding one update. Who sent each
 * one is either "a member" or a short tag of the anonymous device: enough to see that one source
 * sent many, never who it is.
 */

// The newest updates are what a coordinator reviews after abuse; older ones stay in the table.
export const HISTORY_LIMIT = 20;
const ACTOR_TAG_LENGTH = 6;

export type WorksiteUpdateEntry = {
  id: string;
  peoplePresent: number;
  missingSupplyKeys: string[];
  createdAt: Date;
  isCancelled: boolean;
  isMember: boolean;
  /** First characters of the device key; null for a member or after the purge. */
  deviceTag: string | null;
};

/** The home's newest updates, cancelled ones included, in one query. */
export async function listWorksiteUpdateHistory(
  database: Executor,
  { emergencyId, worksiteId }: { emergencyId: string; worksiteId: string },
): Promise<WorksiteUpdateEntry[]> {
  const rows = await database.execute<{
    id: string;
    people_present: number;
    missing: string[];
    created_at: string;
    is_cancelled: boolean;
    is_member: boolean;
    device_tag: string | null;
  }>(sql`
    SELECT u.id, u.people_present,
      coalesce(
        (SELECT array_agg(s.supply_type_key ORDER BY s.supply_type_key)
          FROM worksite_update_supplies s WHERE s.update_id = u.id),
        '{}'
      ) AS missing,
      u.created_at, u.cancelled_at IS NOT NULL AS is_cancelled, u.reported_by IS NOT NULL AS is_member,
      CASE WHEN u.reported_by IS NULL THEN left(u.device_key, ${ACTOR_TAG_LENGTH}) END AS device_tag
    FROM worksite_updates u
    WHERE u.worksite_id = ${worksiteId}::uuid AND u.emergency_id = ${emergencyId}::uuid
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT ${HISTORY_LIMIT}`);
  return rows.map((row) => ({
    id: row.id,
    peoplePresent: row.people_present,
    missingSupplyKeys: row.missing,
    createdAt: new Date(row.created_at),
    isCancelled: row.is_cancelled,
    isMember: row.is_member,
    deviceTag: row.device_tag,
  }));
}

export type CancelWorksiteUpdateResult =
  { ok: true } | { ok: false; code: "forbidden" | "not_found" | "emergency_closed" };

/**
 * A coordinator hides an abusive or wrong update: it stays in the history, cancelled, and the home
 * falls back to the newest one still live. The role is checked inside the statement. Hiding an
 * update already hidden answers ok, so a double tap is harmless.
 */
export async function cancelWorksiteUpdate(
  database: Executor,
  { emergencyId, updateId, userId }: { emergencyId: string; updateId: string; userId: string },
): Promise<CancelWorksiteUpdateResult> {
  const [row] = await database.execute<{
    is_coordinator: boolean;
    was_live: boolean | null;
    changed: boolean;
  }>(sql`
    WITH coordinator AS (
      SELECT EXISTS (
        SELECT 1 FROM emergency_members m
        WHERE m.emergency_id = ${emergencyId}::uuid AND m.user_id = ${userId}::uuid
          AND m.role = 'coordinator' AND m.approved_at IS NOT NULL) AS yes
    ), target AS (
      SELECT id, cancelled_at IS NULL AS was_live FROM worksite_updates
      WHERE id = ${updateId}::uuid AND emergency_id = ${emergencyId}::uuid
    ), cancelled AS (
      UPDATE worksite_updates u SET cancelled_at = now(), cancelled_by = ${userId}::uuid
      FROM target t, coordinator c
      WHERE u.id = t.id AND u.cancelled_at IS NULL AND c.yes
        AND EXISTS (SELECT 1 FROM emergencies e WHERE e.id = ${emergencyId}::uuid AND e.status = 'open')
      RETURNING u.id
    )
    SELECT c.yes AS is_coordinator, t.was_live, EXISTS (SELECT 1 FROM cancelled) AS changed
    FROM coordinator c LEFT JOIN target t ON true`);
  if (!row?.is_coordinator) return { ok: false, code: "forbidden" };
  if (row.was_live === null) return { ok: false, code: "not_found" };
  if (row.changed || !row.was_live) return { ok: true };
  // Live, coordinator, yet unchanged: the emergency closed.
  return { ok: false, code: "emergency_closed" };
}
