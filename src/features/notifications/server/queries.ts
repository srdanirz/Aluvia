import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

// STYLEGUIDE: no list without a limit, 100 at most per page.
const MAX_PAGE_SIZE = 100;

export type UndeliveredNeighborNotice = { id: string; worksiteId: string; type: string; failedAt: Date };

/**
 * Neighbor notices that went out on no channel (ADR 0007, Costos): the coordinator calls these
 * homes by phone. One row per event and home (its last failure); a notice whose SMS fallback
 * was sent, or is still pending, is not listed. Keyset pagination, oldest
 * first. Ids and types only: the caller reads contacts through its own logged contact view, after
 * checking the coordinator's policy.
 */
export async function listUndeliveredNeighborNotices(
  db: Executor,
  input: { emergencyId: string; pageSize?: number; cursor?: { failedAt: Date; id: string } },
) {
  const pageSize = Math.min(input.pageSize ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  const after = input.cursor
    ? sql`AND (n.failed_at, n.id) > (${input.cursor.failedAt.toISOString()}::timestamptz, ${input.cursor.id}::uuid)`
    : sql``;
  const rows = await db.execute<{ id: string; worksiteId: string; type: string; failedAt: string }>(sql`
    SELECT n.id, n.worksite_id AS "worksiteId", n.type, n.failed_at AS "failedAt"
    FROM notifications n
    -- A neighbor who withdrew consent asked not to be contacted; they are not called either.
    JOIN worksite_contacts c ON c.worksite_id = n.worksite_id AND c.notify_channel IS NOT NULL
    WHERE n.emergency_id = ${input.emergencyId} AND n.worksite_id IS NOT NULL
      AND n.failed_at IS NOT NULL AND n.cancelled_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM notifications s
        WHERE s.event_key = n.event_key AND s.worksite_id = n.worksite_id AND s.id <> n.id
          AND (s.sent_at IS NOT NULL OR s.failed_at IS NULL OR (s.failed_at, s.id) > (n.failed_at, n.id)))
      ${after}
    ORDER BY n.failed_at, n.id
    LIMIT ${pageSize + 1}`);
  const items: UndeliveredNeighborNotice[] = rows
    .slice(0, pageSize)
    .map((r) => ({ ...r, failedAt: new Date(r.failedAt) }));
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > pageSize && last ? { failedAt: last.failedAt, id: last.id } : null,
  };
}
