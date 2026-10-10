import { type SQL, sql } from "drizzle-orm";

import { workItemStatus } from "@/shared/db/schema";

import { ATTENTION_LEVELS } from "../attention";

// Work that still needs someone: the enum values prefixed `open_`, read from the enum itself.
const OPEN_STATUSES = workItemStatus.enumValues.filter((status) => status.startsWith("open_"));

/**
 * Hours without activity after which an unattended home shows "to confirm"; per emergency in
 * emergency_settings.
 */
export const STALE_AFTER_HOURS_DEFAULT = 48;

/**
 * A home's attention level, from its work items (ADR 0011). For use inside a GROUP BY worksites.id
 * with worksites as `w` and work_items LEFT JOINed as `wi`. `staleBefore` is the instant before
 * which an unattended home with no activity counts as "to confirm".
 */
export function attentionLevelSql(staleBefore: SQL): SQL {
  const isOpen = sql`wi.status IN (${sql.join(
    OPEN_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  )})`;
  return sql`CASE
    WHEN cardinality(w.hazards) > 0 AND w.hazards_reviewed_at IS NULL THEN 'do_not_enter'
    WHEN coalesce(bool_or(${isOpen} AND wi.claimed_by IS NOT NULL), false) THEN 'in_progress'
    WHEN count(wi.id) > 0 AND NOT bool_or(${isOpen}) THEN 'attended'
    WHEN count(wi.id) = 0 AND w.source = 'official' THEN 'no_request'
    WHEN ${lastActivitySql} < ${staleBefore} THEN 'unconfirmed'
    ELSE 'unattended'
  END`;
}

/** The last time anyone touched the home or its work. Same grouping as attentionLevelSql. */
export const lastActivitySql = sql`greatest(w.updated_at, max(wi.updated_at))`;

/**
 * Instant before which an emergency's homes are stale, for a query that has emergencies as `e`
 * and LEFT JOINs emergency_settings as `es` (one row per emergency, so the join is per query).
 */
export function staleBeforeSql(now: Date): SQL {
  return sql`(${now.toISOString()}::timestamptz - make_interval(hours => coalesce(es.stale_after_hours, ${STALE_AFTER_HOURS_DEFAULT}::int)))`;
}

/** Sort key of a level column, most urgent first, in ATTENTION_LEVELS order. */
export function levelRankSql(level: SQL): SQL {
  const whens = ATTENTION_LEVELS.map((name, rank) => sql`WHEN ${name} THEN ${rank}::int`);
  return sql`CASE ${level} ${sql.join(whens, sql` `)} END`;
}
