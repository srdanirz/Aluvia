import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

/** One supply of the emergency's catalog with how much it is missed and how much it is spare. */
export type SupplyBalanceItem = {
  key: string;
  name: string;
  /** Homes whose current field update lists it as missing. */
  missingAt: number;
  /** Active collection points that marked it as surplus ("no traigas"). */
  surplusAt: number;
};

export type SupplyBalance = { missing: SupplyBalanceItem[]; surplus: SupplyBalanceItem[] };

/**
 * What to bring and what not to (issue #14), for the whole emergency, in one query. "Missing"
 * counts each home once by its newest field update that was not cancelled, so an old report a
 * neighbor already corrected does not count; "surplus" counts active collection points. Supplies
 * with neither are left out. A supply can be in both: one point has too much of what homes miss.
 */
export async function findSupplyBalance(
  db: Executor,
  { emergencyId, locale }: { emergencyId: string; locale: string },
): Promise<SupplyBalance> {
  const rows = await db.execute<{ key: string; name: string; missing_at: number; surplus_at: number }>(sql`
    WITH current AS (
      SELECT DISTINCT ON (u.worksite_id) u.id
      FROM worksite_updates u
      WHERE u.emergency_id = ${emergencyId} AND u.cancelled_at IS NULL
      ORDER BY u.worksite_id, u.created_at DESC, u.id DESC
    ), missing AS (
      SELECT s.supply_type_key AS key, count(*)::int AS homes
      FROM worksite_update_supplies s JOIN current c ON c.id = s.update_id
      GROUP BY s.supply_type_key
    ), surplus AS (
      SELECT k.key, count(*)::int AS points
      FROM collection_points cp, unnest(cp.surplus) AS k(key)
      WHERE cp.emergency_id = ${emergencyId} AND cp.removed_at IS NULL
      GROUP BY k.key
    )
    SELECT st.key,
      coalesce(st.name ->> ${locale}, st.name ->> e.default_locale) AS name,
      coalesce(m.homes, 0) AS missing_at,
      coalesce(sp.points, 0) AS surplus_at
    FROM supply_types st
    JOIN emergencies e ON e.id = st.emergency_id
    LEFT JOIN missing m ON m.key = st.key
    LEFT JOIN surplus sp ON sp.key = st.key
    WHERE st.emergency_id = ${emergencyId} AND (m.homes > 0 OR sp.points > 0)
    ORDER BY st.sort_order, st.key`);
  const items = rows.map((row) => ({
    key: row.key,
    name: row.name,
    missingAt: row.missing_at,
    surplusAt: row.surplus_at,
  }));
  return {
    missing: items.filter((item) => item.missingAt > 0).sort((a, b) => b.missingAt - a.missingAt),
    surplus: items.filter((item) => item.surplusAt > 0).sort((a, b) => b.surplusAt - a.surplusAt),
  };
}
