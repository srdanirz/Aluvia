import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, pageOf } from "@/shared/lib/pagination";

const SHIFTS_PAGE_SIZE = 20;

export type UpcomingShift = {
  id: string;
  meetingPoint: string;
  workType: string | null;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  filled: number;
  /** False without a signed-in viewer. */
  isSignedUp: boolean;
};

/**
 * Shifts that have not started, soonest first, with whether the viewer holds a seat. One query
 * per page whatever its size, served by shifts_emergency_id_starts_at_idx.
 */
export async function listUpcomingShifts(
  db: Executor,
  {
    emergencyId,
    userId,
    locale,
    now,
    cursor,
  }: { emergencyId: string; userId: string | null; locale: string; now?: Date; cursor?: string },
): Promise<Page<UpcomingShift>> {
  const after = decodeTimeCursor(cursor);
  const rows = await db.execute<{
    id: string;
    cursor_at: string;
    meeting_point: string;
    work_type: string | null;
    starts_at: Date | string;
    ends_at: Date | string;
    capacity: number;
    filled: number;
    is_signed_up: boolean;
  }>(sql`
    SELECT s.id, s.starts_at::text AS cursor_at, s.meeting_point,
      coalesce(wt.name ->> ${locale}, wt.name ->> e.default_locale, wt.key) AS work_type,
      s.starts_at, s.ends_at, s.capacity, s.filled,
      ${
        userId
          ? sql`EXISTS (SELECT 1 FROM shift_signups x WHERE x.shift_id = s.id AND x.user_id = ${userId}::uuid AND x.cancelled_at IS NULL)`
          : sql`false`
      } AS is_signed_up
    FROM shifts s
    JOIN emergencies e ON e.id = s.emergency_id
    LEFT JOIN work_types wt ON wt.emergency_id = s.emergency_id AND wt.key = s.work_type_key
    WHERE s.emergency_id = ${emergencyId}::uuid AND s.starts_at > ${dbNow(now)}
      ${after ? sql`AND (s.starts_at, s.id) > (${after[0]}::timestamptz, ${after[1]}::uuid)` : sql``}
    ORDER BY s.starts_at, s.id
    LIMIT ${SHIFTS_PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.id), SHIFTS_PAGE_SIZE);
  return {
    items: page.items.map((row) => ({
      id: row.id,
      meetingPoint: row.meeting_point,
      workType: row.work_type,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      capacity: row.capacity,
      filled: row.filled,
      isSignedUp: row.is_signed_up,
    })),
    nextCursor: page.nextCursor,
  };
}
