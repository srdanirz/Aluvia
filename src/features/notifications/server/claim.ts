import { sql } from "drizzle-orm";

import type { Database } from "@/shared/db/types";

import { retryOnDeadlock } from "./deadlock";
import { reservePaidMessages } from "./quota";

// A claimed row whose worker died is retaken after this. It must outlast one batch: every
// provider call times out at 10 s and a batch sends in parallel, so 2 min leaves wide margin
// while staying inside the 2 min outbox-lag alert (ADR 0008).
export const LEASE_SECONDS = 120;

// ADR 0007: normal notices wait out 22:00 to 08:00 in the emergency's time zone.
const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;

export type ClaimedNotification = {
  id: string;
  emergencyId: string;
  eventKey: string;
  type: string;
  userId: string | null;
  worksiteId: string | null;
  channel: "push" | "email" | "sms" | "whatsapp";
  level: "important" | "shift_reminder" | "normal" | "digest";
  payload: Record<string, string>;
  attempts: number;
  notBefore: Date;
  // Calendar day in the emergency's time zone, the key of the daily cap.
  localDay: string;
};

// json_agg renders timestamps as ISO strings.
type ClaimedRow = Omit<ClaimedNotification, "notBefore"> & { notBefore: string };

/**
 * Takes up to `limit` due notifications for this worker (ADR 0007). One short transaction:
 * rows are picked with FOR UPDATE SKIP LOCKED, so concurrent workers never take the same row;
 * normal notices inside quiet hours are pushed to 08:00; a paid fallback whose push was already
 * read is closed; the rest are stamped `claimed_at = now`, which is both the lease and the fence
 * the outcome update checks. Paid messages then reserve their share of the daily cap.
 * Nothing is sent here: the caller sends after this commits.
 */
export async function claimNotifications(db: Database, now: Date, limit: number) {
  // Nothing is sent before this commits, so running it again after a deadlock is harmless.
  return retryOnDeadlock(() => claimTransaction(db, now, limit));
}

async function claimTransaction(db: Database, now: Date, limit: number) {
  return db.transaction(async (tx) => {
    const leaseExpiry = new Date(now.getTime() - LEASE_SECONDS * 1000);
    const rows = await tx.execute<{ picked: number; rows: ClaimedRow[] }>(sql`
      WITH due AS (
        SELECT n.id, n.level, n.channel, n.user_id, n.event_key, n.cancelled_at IS NOT NULL AS cancelled,
          (${now.toISOString()}::timestamptz AT TIME ZONE e.time_zone) AS local_now,
          e.time_zone,
          COALESCE(p.quiet_hours, true) AS wants_quiet
        FROM notifications n
        JOIN emergencies e ON e.id = n.emergency_id
        LEFT JOIN notification_preferences p ON p.user_id = n.user_id
        WHERE n.sent_at IS NULL AND n.failed_at IS NULL
          AND n.not_before <= ${now.toISOString()}
          AND (n.claimed_at IS NULL OR n.claimed_at < ${leaseExpiry.toISOString()})
        ORDER BY n.not_before
        LIMIT ${limit}
        FOR UPDATE OF n SKIP LOCKED
      ),
      decided AS (
        SELECT due.*,
          CASE
            -- Its event was withdrawn: this row was held when it happened, or is a fallback
            -- inserted concurrently with the cancellation.
            WHEN cancelled OR EXISTS (
              SELECT 1 FROM notifications c
              WHERE c.event_key = due.event_key AND c.cancelled_at IS NOT NULL)
            THEN 'cancelled'
            WHEN level = 'normal' AND wants_quiet
              AND (extract(hour FROM local_now) >= ${QUIET_START_HOUR} OR extract(hour FROM local_now) < ${QUIET_END_HOUR})
            THEN 'defer'
            -- Read on any channel (the push, or an earlier paid message's link): nothing more to send.
            WHEN channel IN ('sms', 'whatsapp') AND user_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM notifications s
              WHERE s.event_key = due.event_key AND s.user_id = due.user_id
                AND s.id <> due.id AND s.read_at IS NOT NULL)
            THEN 'read_elsewhere'
            ELSE 'claim'
          END AS action
        FROM due
      ),
      deferred AS (
        UPDATE notifications n
        SET claimed_at = NULL,
          not_before = (date_trunc('day', d.local_now) + make_interval(hours => ${QUIET_END_HOUR})
            + CASE WHEN extract(hour FROM d.local_now) >= ${QUIET_START_HOUR} THEN interval '1 day' ELSE interval '0' END
          ) AT TIME ZONE d.time_zone
        FROM decided d
        WHERE n.id = d.id AND d.action = 'defer'
        RETURNING n.id
      ),
      -- Data-modifying CTEs always run to completion, read or not; the three touch disjoint rows.
      closed AS (
        UPDATE notifications n
        SET claimed_at = NULL, failed_at = ${now.toISOString()}, failure_code = d.action
        FROM decided d
        WHERE n.id = d.id AND d.action IN ('read_elsewhere', 'cancelled')
        RETURNING n.id
      ),
      claimed AS (
        UPDATE notifications n
        SET claimed_at = ${now.toISOString()}, attempts = n.attempts + 1
        FROM decided d
        WHERE n.id = d.id AND d.action = 'claim'
        RETURNING n.id, n.emergency_id AS "emergencyId", n.event_key AS "eventKey", n.type,
          n.user_id AS "userId", n.worksite_id AS "worksiteId", n.channel, n.level, n.payload,
          n.attempts, n.not_before AS "notBefore", to_char(d.local_now, 'YYYY-MM-DD') AS "localDay"
      )
      SELECT (SELECT count(*)::int FROM due) AS picked,
        COALESCE((SELECT json_agg(claimed) FROM claimed), '[]'::json) AS rows`);

    const [result] = rows;
    const claimed: ClaimedNotification[] = (result?.rows ?? []).map((row) => ({
      ...row,
      notBefore: new Date(row.notBefore),
    }));
    const sendable = await reservePaidMessages(tx, claimed, now);
    // `picked` counts deferred and closed rows too: a full pick means more may be waiting.
    return { picked: result?.picked ?? 0, claimed, sendable };
  });
}
