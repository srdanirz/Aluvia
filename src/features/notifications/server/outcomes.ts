import { sql } from "drizzle-orm";

import type { Database } from "@/shared/db/types";

import type { ChannelResult } from "../channels/types";
import type { ClaimedNotification } from "./claim";
import { retryOnDeadlock } from "./deadlock";
import { fallBackToSms } from "./fallback";
import { optOutFromSms } from "./opt-out";
import { lockPaidUsage, refundPaidMessages } from "./quota";

// Retries wait 30 s, 1, 2, 4, 8, 16 and 30 min: about an hour of provider trouble before the
// notice closes. An important notice that late has usually been escalated or made moot.
const RETRY_BASE_SECONDS = 30;
const RETRY_MAX_SECONDS = 30 * 60;
export const MAX_ATTEMPTS = 8;

export function retryDelaySeconds(attempts: number): number {
  return Math.min(RETRY_BASE_SECONDS * 2 ** (attempts - 1), RETRY_MAX_SECONDS);
}

export type Outcome = {
  notification: ClaimedNotification;
  result: ChannelResult;
  // When the provider answered.
  sentAt: Date;
  // The phone it went to, kept only to honor a provider-level opt-out (Twilio 21610).
  phone?: string;
};

/**
 * Writes what happened to a sent batch, in one transaction and a fixed number of statements.
 * Every update is fenced on `claimed_at = claimedAt`: if this worker's lease ran out and another
 * worker took the row, this one leaves it alone. Paid slots go back only for rows this worker
 * still held, a push that failed for good brings its paid fallback forward, a WhatsApp that failed
 * for good falls back to SMS, a phone the provider reports opted out stops getting SMS, and a row
 * whose event was cancelled while held closes as cancelled.
 */
export async function recordOutcomes(db: Database, outcomes: Outcome[], claimedAt: Date) {
  // Losing an outcome would leave sent notices claimed, to be sent again when the lease runs out.
  return retryOnDeadlock(() => writeOutcomes(db, outcomes, claimedAt));
}

async function writeOutcomes(db: Database, outcomes: Outcome[], claimedAt: Date) {
  const sent = outcomes.filter((o) => o.result.ok);
  const retries: { id: string; notBefore: Date }[] = [];
  const failures: { id: string; code: string }[] = [];
  for (const { notification, result } of outcomes) {
    if (result.ok) continue;
    if (result.retryable && notification.attempts < MAX_ATTEMPTS) {
      const delay = retryDelaySeconds(notification.attempts) * 1000;
      retries.push({ id: notification.id, notBefore: new Date(claimedAt.getTime() + delay) });
    } else {
      failures.push({ id: notification.id, code: result.code });
    }
  }
  const expiredEndpoints = outcomes.flatMap((o) => o.result.expiredEndpoints ?? []);
  const optedOutPhones = outcomes.flatMap((o) =>
    !o.result.ok && o.result.code === "recipient_opted_out" && o.phone ? [o.phone] : [],
  );
  const byId = new Map(outcomes.map((o) => [o.notification.id, o.notification]));
  const fence = claimedAt.toISOString();

  return db.transaction(async (tx) => {
    // Withdrawn while this worker held them: they close as cancelled, neither retried nor fallen back.
    const unsentIds = [...retries.map((r) => r.id), ...failures.map((f) => f.id)];
    const cancelledRows =
      unsentIds.length === 0
        ? []
        : await tx.execute<{ id: string }>(sql`
            UPDATE notifications SET claimed_at = NULL, failed_at = ${fence}, failure_code = 'cancelled'
            WHERE id IN ${unsentIds} AND claimed_at = ${fence} AND cancelled_at IS NOT NULL
            RETURNING id`);

    const sentRows =
      sent.length === 0
        ? []
        : await tx.execute<{ id: string }>(sql`
            UPDATE notifications n
            SET sent_at = v.sent_at, provider_message_id = v.provider_message_id, claimed_at = NULL
            FROM (VALUES ${sql.join(
              sent.map(
                (o) =>
                  sql`(${o.notification.id}::uuid, ${o.sentAt.toISOString()}::timestamptz, ${
                    o.result.ok ? (o.result.providerMessageId ?? null) : null
                  }::text)`,
              ),
              sql`, `,
            )}) AS v(id, sent_at, provider_message_id)
            WHERE n.id = v.id AND n.claimed_at = ${fence}
            RETURNING n.id`);

    const retriedRows =
      retries.length === 0
        ? []
        : await tx.execute<{ id: string }>(sql`
            UPDATE notifications n SET claimed_at = NULL, not_before = v.not_before
            FROM (VALUES ${sql.join(
              retries.map((r) => sql`(${r.id}::uuid, ${r.notBefore.toISOString()}::timestamptz)`),
              sql`, `,
            )}) AS v(id, not_before)
            WHERE n.id = v.id AND n.claimed_at = ${fence}
            RETURNING n.id`);

    const failedRows =
      failures.length === 0
        ? []
        : await tx.execute<{ id: string; code: string }>(sql`
            UPDATE notifications n SET claimed_at = NULL, failed_at = ${fence}, failure_code = v.code
            FROM (VALUES ${sql.join(
              failures.map((f) => sql`(${f.id}::uuid, ${f.code})`),
              sql`, `,
            )}) AS v(id, code)
            WHERE n.id = v.id AND n.claimed_at = ${fence}
            RETURNING n.id, v.code`);

    // Escalation (ADR 0007): no push to wait for, so the paid fallback goes now.
    const failedPush = failedRows.flatMap((r) => {
      const n = byId.get(r.id);
      return n && n.channel === "push" && n.userId !== null ? [n] : [];
    });
    if (failedPush.length > 0) {
      await tx.execute(sql`
        UPDATE notifications n SET not_before = ${fence}
        FROM (VALUES ${sql.join(
          failedPush.map((p) => sql`(${p.eventKey}, ${p.userId}::uuid)`),
          sql`, `,
        )}) AS v(event_key, user_id)
        WHERE n.event_key = v.event_key AND n.user_id = v.user_id
          AND n.channel IN ('sms', 'whatsapp')
          AND n.sent_at IS NULL AND n.failed_at IS NULL AND n.claimed_at IS NULL
          AND n.not_before > ${fence}`);
    }

    await fallBackToSms(
      tx,
      failedRows.flatMap((r) => {
        const n = byId.get(r.id);
        return n ? [{ id: n.id, channel: n.channel, code: r.code }] : [];
      }),
      claimedAt,
    );
    await optOutFromSms(tx, [...new Set(optedOutPhones)]);

    if (expiredEndpoints.length > 0) {
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE endpoint IN ${expiredEndpoints}`);
    }

    // Usage rows last: a claim locks notification rows before usage rows, so the same order here
    // keeps a claim and an outcome from waiting on each other in a cycle.
    const unsent = [...cancelledRows, ...retriedRows, ...failedRows].flatMap((r) => byId.get(r.id) ?? []);
    await lockPaidUsage(tx, unsent);
    await refundPaidMessages(tx, unsent);

    return {
      sent: sentRows.map((r) => r.id),
      retried: retriedRows.map((r) => r.id),
      failed: [...cancelledRows, ...failedRows].map((r) => r.id),
    };
  });
}
