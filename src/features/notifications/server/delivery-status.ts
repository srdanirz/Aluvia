import { type SQL, sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import { fallBackToSms } from "./fallback";

// A report that has matched nothing in a day is for a message we never sent.
const REPORT_TTL_HOURS = 24;

/**
 * Records a delivery failure a provider reports after accepting the message (Twilio status
 * callback; WhatsApp statuses, which reach the bot's webhook, #20): the notice was not delivered
 * after all, so it closes as failed and a WhatsApp falls back to SMS. Matched by the provider's
 * message id. The report can arrive before the worker has stored that id; then it is kept and
 * applyDeliveryReports applies it on the next run. A repeated report changes nothing.
 */
export async function markNotificationUndelivered(
  db: Executor,
  input: { channel: "sms" | "whatsapp"; providerMessageId: string; code: string; now: Date },
) {
  await db.transaction(async (tx) => {
    const rows = await closeUndelivered(
      tx,
      sql`(VALUES (${input.providerMessageId}, ${input.code}))`,
      input.now,
    );
    if (rows.length > 0) return;
    await tx.execute(sql`
      INSERT INTO notification_delivery_reports (provider_message_id, channel, code, reported_at)
      VALUES (${input.providerMessageId}, ${input.channel}, ${input.code}, ${input.now.toISOString()})
      ON CONFLICT DO NOTHING`);
  });
}

/** Applies the reports that arrived before their notice was recorded, and drops stale ones. */
export async function applyDeliveryReports(db: Executor, now: Date) {
  await db.transaction(async (tx) => {
    const applied = await closeUndelivered(
      tx,
      sql`(SELECT provider_message_id, code FROM notification_delivery_reports)`,
      now,
    );
    const staleBefore = new Date(now.getTime() - REPORT_TTL_HOURS * 3600_000).toISOString();
    const appliedIds = applied.map((r) => r.providerMessageId);
    await tx.execute(sql`
      DELETE FROM notification_delivery_reports
      WHERE reported_at < ${staleBefore}
        ${appliedIds.length > 0 ? sql`OR provider_message_id IN ${appliedIds}` : sql``}`);
  });
}

async function closeUndelivered(tx: Executor, reports: SQL, now: Date) {
  const rows = await tx.execute<{ id: string; channel: string; code: string; providerMessageId: string }>(sql`
    UPDATE notifications n
    SET sent_at = NULL, failed_at = ${now.toISOString()}, failure_code = r.code
    FROM ${reports} AS r(provider_message_id, code)
    WHERE n.provider_message_id = r.provider_message_id AND n.sent_at IS NOT NULL
    RETURNING n.id, n.channel, r.code, n.provider_message_id AS "providerMessageId"`);
  await fallBackToSms(tx, rows, now);
  return rows;
}
