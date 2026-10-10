import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import { NOTIFICATION_TYPES, type NotificationParams, type NotificationType } from "../catalog";

// ADR 0007: an important notice escalates to SMS or WhatsApp when the push was not read in this time.
const ESCALATION_DELAY_SECONDS = 15 * 60;

// Channels each level may use (ADR 0007, Niveles). A person still receives only the ones they opted into.
const LEVEL_CHANNELS = {
  important: ["push", "sms", "whatsapp"],
  shift_reminder: ["push", "email"],
  normal: ["push", "email"],
  digest: ["push", "email"],
} as const;

type Recipients<T extends NotificationType> = (typeof NOTIFICATION_TYPES)[T]["recipient"] extends "user"
  ? { userIds: string[] }
  : { worksiteIds: string[] };

export type EnqueueInput<T extends NotificationType> = {
  type: T;
  emergencyId: string;
  // Identifies the event, not the notice: the same key never yields two rows per person and channel.
  eventKey: string;
  params: NotificationParams<T>;
  now: Date;
  // When the notice may go out; defaults to now. Shift reminders use it to schedule ahead.
  notBefore?: Date;
} & Recipients<NoInfer<T>>;

/**
 * Writes the outbox rows for one event (ADR 0007). Call it with the transaction that makes the
 * change, so the notice exists if and only if the change committed. One INSERT whatever the number
 * of recipients; channels come from each person's preferences, and a repeated event inserts nothing.
 * Returns how many rows were inserted.
 */
export async function enqueueNotification<T extends NotificationType>(
  db: Executor,
  input: EnqueueInput<T>,
): Promise<number> {
  const definition = NOTIFICATION_TYPES[input.type];
  const payload = definition.params.parse(input.params);
  const notBefore = input.notBefore ?? input.now;
  const common = sql`${input.emergencyId}::uuid, ${input.eventKey}, ${input.type}, ${definition.level}::notification_level, ${JSON.stringify(payload)}::jsonb`;

  if ("worksiteIds" in input) {
    // Neighbors have no app: only important notices reach them, on the channel they consented to.
    if (definition.level !== "important" || input.worksiteIds.length === 0) return 0;
    const rows = await db.execute(sql`
      INSERT INTO notifications (emergency_id, event_key, type, level, payload, worksite_id, channel, not_before)
      SELECT ${common}, c.worksite_id, c.notify_channel, ${notBefore.toISOString()}::timestamptz
      FROM worksite_contacts c
      JOIN worksites w ON w.id = c.worksite_id AND w.emergency_id = ${input.emergencyId}
      WHERE c.worksite_id IN ${input.worksiteIds} AND c.notify_channel IS NOT NULL
      ON CONFLICT DO NOTHING
      RETURNING id`);
    return rows.length;
  }

  if (input.userIds.length === 0) return 0;
  const channels = LEVEL_CHANNELS[definition.level];
  const escalateAt = new Date(notBefore.getTime() + ESCALATION_DELAY_SECONDS * 1000);
  // Paid channels wait for the push to be read, unless there is no push to wait for.
  const rows = await db.execute(sql`
    INSERT INTO notifications (emergency_id, event_key, type, level, payload, user_id, channel, not_before)
    SELECT ${common}, u.id, c.channel,
      CASE
        WHEN c.channel IN ('sms', 'whatsapp')
          AND 'push' = ANY(COALESCE(p.channels, '{push}'))
          AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = u.id)
        THEN ${escalateAt.toISOString()}::timestamptz
        ELSE ${notBefore.toISOString()}::timestamptz
      END
    FROM users u
    LEFT JOIN notification_preferences p ON p.user_id = u.id
    CROSS JOIN LATERAL unnest(COALESCE(p.channels, '{push}'::notification_channel[])) AS c(channel)
    WHERE u.id IN ${input.userIds} AND c.channel::text IN ${channels}
      -- One paid message per event (ADR 0007: SMS or WhatsApp): WhatsApp when chosen, and SMS
      -- only as its fallback (fallback.ts), never both up front.
      AND NOT (c.channel = 'sms' AND 'whatsapp' = ANY(COALESCE(p.channels, '{push}')))
    ON CONFLICT DO NOTHING
    RETURNING id`);
  return rows.length;
}
