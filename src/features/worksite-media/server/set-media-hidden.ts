import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

/**
 * Hides a photo or video from the public, or shows it again; coordinators and platform admins. One conditional UPDATE: hiding what is already hidden changes nothing, and the
 * statement re-checks that the actor coordinates the item's emergency. A hidden item frees its
 * slot in the home's limits.
 */
export async function setWorksiteMediaHidden(
  database: Executor,
  actorId: string,
  { mediaId, hidden }: { mediaId: string; hidden: boolean },
): Promise<{ ok: true } | { ok: false; code: "media_not_found" }> {
  const rows = await database.execute<{ id: string }>(sql`
    UPDATE worksite_media m
    SET hidden_at = ${hidden ? sql`now()` : sql`NULL`}, hidden_by = ${hidden ? actorId : null}
    WHERE m.id = ${mediaId}
      AND (EXISTS (
        SELECT 1 FROM emergency_members em
        WHERE em.emergency_id = m.emergency_id AND em.user_id = ${actorId} AND em.role = 'coordinator'
      ) OR EXISTS (SELECT 1 FROM users u WHERE u.id = ${actorId} AND u.platform_role = 'admin')
      )
    RETURNING m.id
  `);
  return rows.length > 0 ? { ok: true } : { ok: false, code: "media_not_found" };
}
