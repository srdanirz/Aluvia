import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

/**
 * Withdraws an event's notices (a cancelled shift sign-up drops its reminder). Call it in the
 * transaction that undoes the event. Every row of the event is marked, sent or not, so nothing
 * derived from it later (a retry, an SMS fallback, a late "undelivered" report) goes out or lands
 * on the coordinator's call list. Unclaimed pending rows close as `cancelled` now; a row a worker
 * holds closes as cancelled when it reports, unless the provider already took it, since that call
 * cannot be taken back. Returns how many pending rows it closed now.
 */
export async function cancelPendingNotifications(db: Executor, input: { eventKey: string; now: Date }) {
  const now = input.now.toISOString();
  await db.execute(sql`
    UPDATE notifications SET cancelled_at = ${now}
    WHERE event_key = ${input.eventKey} AND cancelled_at IS NULL`);
  const closed = await db.execute(sql`
    UPDATE notifications SET failed_at = ${now}, failure_code = 'cancelled'
    WHERE event_key = ${input.eventKey} AND claimed_at IS NULL AND sent_at IS NULL AND failed_at IS NULL
    RETURNING id`);
  return closed.length;
}
