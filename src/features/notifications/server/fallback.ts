import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

// Failures that say nothing about WhatsApp itself: SMS would fail or be unwanted for the same reason.
const NO_FALLBACK = new Set([
  "no_consent",
  "not_opted_in",
  "read_elsewhere",
  "no_address",
  "invalid_payload",
  "cancelled",
]);

/**
 * When WhatsApp fails for good (Meta blocks the number, a template is missing, the provider is
 * down past its retries, the daily cap ran out, or Meta reports it undelivered), the notice falls
 * back to SMS on the same phone (docs/investigacion/04-casos-borde.md, canales). A neighbor's
 * consent covers both, since it is consent to be told about their home by phone; a volunteer
 * gets it only if they opted into SMS. One INSERT; the unique key keeps it to one SMS per event
 * and person.
 */
export async function fallBackToSms(
  db: Executor,
  failed: { id: string; channel: string; code: string }[],
  now: Date,
) {
  const ids = failed.filter((f) => f.channel === "whatsapp" && !NO_FALLBACK.has(f.code)).map((f) => f.id);
  if (ids.length === 0) return;
  await db.execute(sql`
    INSERT INTO notifications (emergency_id, event_key, type, level, payload, user_id, worksite_id, channel, not_before)
    SELECT n.emergency_id, n.event_key, n.type, n.level, n.payload, n.user_id, n.worksite_id, 'sms', ${now.toISOString()}::timestamptz
    FROM notifications n
    LEFT JOIN notification_preferences p ON p.user_id = n.user_id
    WHERE n.id IN ${ids} AND n.cancelled_at IS NULL
      AND (n.worksite_id IS NOT NULL OR 'sms' = ANY(COALESCE(p.channels, '{push}'::notification_channel[])))
    ON CONFLICT DO NOTHING`);
}
