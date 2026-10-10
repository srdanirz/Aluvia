import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

/**
 * Brings `worksites.unclaimed_since` in line with the homes' work (ADR 0005): set when a home has
 * open work and none of it claimed, null otherwise. A home that was already waiting keeps its
 * original instant, so abandonment is measured from the first moment nobody was on it.
 * Call it in the transaction of every work_items write. One statement for any number of homes.
 */
export async function recomputeUnclaimedSince(
  tx: Executor,
  { worksiteIds, now }: { worksiteIds: readonly string[]; now?: Date },
): Promise<void> {
  if (worksiteIds.length === 0) return;
  const ids = sqlArray(worksiteIds, "uuid");
  // Lock the homes first, in id order, in a statement of its own: the UPDATE below then starts
  // after the lock with a fresh snapshot, so whoever recomputes last sees every committed job.
  // In one statement the aggregate would be read before waiting, and two volunteers releasing
  // the two jobs of one home at once would each still see the other's claim and both write null.
  await tx.execute(sql`SELECT 1 FROM worksites WHERE id = ANY(${ids}) ORDER BY id FOR NO KEY UPDATE`);
  await tx.execute(sql`
    UPDATE worksites w
    SET unclaimed_since = CASE
        WHEN s.has_open AND NOT s.has_claimed THEN coalesce(w.unclaimed_since, ${dbNow(now)})
      END,
      updated_at = ${dbNow(now)}
    FROM (
      SELECT ws.id,
        coalesce(bool_or(wi.status::text LIKE 'open\\_%'), false) AS has_open,
        coalesce(bool_or(wi.status::text LIKE 'open\\_%' AND wi.claimed_by IS NOT NULL), false) AS has_claimed
      FROM worksites ws
      LEFT JOIN work_items wi ON wi.worksite_id = ws.id AND wi.emergency_id = ws.emergency_id
      WHERE ws.id = ANY(${ids})
      GROUP BY ws.id
    ) s
    WHERE w.id = s.id`);
}
