import { sql } from "drizzle-orm";

import type { Database } from "@/shared/db/types";
import { logError } from "@/shared/observability/logger";
import { matchLocale } from "@/shared/i18n/messages";

import type { ChannelAdapters, ChannelResult, Delivery } from "../channels/types";
import { type ClaimedNotification, claimNotifications } from "./claim";
import { applyDeliveryReports } from "./delivery-status";
import {
  backlogGauge,
  delayHistogram,
  failedCounter,
  retriedCounter,
  runsCounter,
  sentCounter,
} from "./metrics";
import { type Outcome, recordOutcomes } from "./outcomes";
import { type Recipients, loadRecipients } from "./recipients";
import { renderMessage } from "./render";

// Rows per round. Sends in a round run in parallel, so this bounds open provider connections.
const BATCH_SIZE = 50;

export type DispatchOptions = {
  db: Database;
  adapters: ChannelAdapters;
  // Absolute origin for links in notices, no trailing slash.
  appUrl: string;
  clock: () => Date;
  // Stop starting new rounds after this instant; the scheduler calls again next minute.
  deadline: Date;
  batchSize?: number;
};

export type DispatchSummary = { claimed: number; sent: number; retried: number; failed: number };

/**
 * Delivers due notifications at least once (ADR 0007): claim a batch, send outside any
 * transaction, record outcomes, and repeat while full batches keep coming and time remains.
 * Safe to run on many instances at once: claims never overlap, and a row is sent again only if
 * its worker died between the provider call and recording it.
 */
export async function dispatchNotifications(options: DispatchOptions): Promise<DispatchSummary> {
  const total: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0 };
  // Failures a provider reported before their notice was recorded; their SMS fallback goes this run.
  await applyDeliveryReports(options.db, options.clock());
  // Rounds run one after another on purpose: each is a fixed number of queries for a whole batch,
  // not a query per row, and the recursion stops on a short batch or the deadline.
  const round = async (): Promise<DispatchSummary> => {
    const batchSize = options.batchSize ?? BATCH_SIZE;
    const now = options.clock();
    const { picked, claimed, sendable } = await claimNotifications(options.db, now, batchSize);
    const capped = claimed.length - sendable.length;
    for (const n of claimed) {
      if (!sendable.includes(n)) failedCounter.add(1, { channel: n.channel, code: "daily_cap_reached" });
    }
    const result = await deliverBatch(options, sendable, now);
    total.claimed += claimed.length;
    total.sent += result.sent;
    total.retried += result.retried;
    total.failed += result.failed + capped;
    if (picked < batchSize || options.clock() >= options.deadline) return total;
    return round();
  };
  const summary = await round();
  await recordBacklog(options.db, options.clock());
  return summary;
}

async function recordBacklog(db: Database, now: Date) {
  const [row] = await db.execute<{ age: number | null }>(sql`
    SELECT extract(epoch FROM ${now.toISOString()}::timestamptz - min(not_before))::float8 AS age
    FROM notifications
    WHERE sent_at IS NULL AND failed_at IS NULL AND not_before <= ${now.toISOString()}`);
  runsCounter.add(1);
  backlogGauge.record(Math.max(0, row?.age ?? 0));
}

async function deliverBatch(options: DispatchOptions, batch: ClaimedNotification[], claimedAt: Date) {
  if (batch.length === 0) return { sent: 0, retried: 0, failed: 0 };
  const recipients = await loadRecipients(options.db, batch);
  const outcomes = await Promise.all(
    batch.map(async (notification): Promise<Outcome> => {
      const { result, phone } = await send(notification, recipients, options);
      return { notification, result, phone, sentAt: options.clock() };
    }),
  );
  const recorded = await recordOutcomes(options.db, outcomes, claimedAt);

  const byId = new Map(outcomes.map((o) => [o.notification.id, o]));
  for (const id of recorded.sent) {
    const { notification, sentAt } = byId.get(id)!;
    sentCounter.add(1, { channel: notification.channel, level: notification.level });
    delayHistogram.record((sentAt.getTime() - notification.notBefore.getTime()) / 1000, {
      channel: notification.channel,
    });
  }
  for (const id of recorded.retried) {
    const { notification, result } = byId.get(id)!;
    retriedCounter.add(1, { channel: notification.channel, code: result.ok ? "unknown" : result.code });
  }
  for (const id of recorded.failed) {
    const { notification, result } = byId.get(id)!;
    failedCounter.add(1, { channel: notification.channel, code: result.ok ? "unknown" : result.code });
  }
  return { sent: recorded.sent.length, retried: recorded.retried.length, failed: recorded.failed.length };
}

const fail = (code: string): ChannelResult => ({ ok: false, code, retryable: false });

/**
 * Never throws: a notice that cannot be addressed closes with its code, and a throw anywhere
 * (a bug in an adapter or in rendering) becomes a retryable failure. One throwing row must not
 * keep the rest of the batch from being recorded, or they would be sent again after the lease.
 */
async function send(
  notification: ClaimedNotification,
  recipients: Recipients,
  options: DispatchOptions,
): Promise<{ result: ChannelResult; phone?: string }> {
  try {
    const prepared = await prepareDelivery(notification, recipients, options.appUrl);
    if ("code" in prepared) return { result: fail(prepared.code) };
    const phone = "phone" in prepared ? prepared.phone : undefined;
    const adapter = options.adapters[prepared.channel] as
      { send: (delivery: Delivery) => Promise<ChannelResult> } | undefined;
    if (!adapter) return { result: fail("channel_unavailable"), phone };
    return { result: await adapter.send(prepared), phone };
  } catch (error) {
    // Ids and enums only (STYLEGUIDE, Datos personales). The error's message can carry a push
    // endpoint, an email or a provider's reply, so only its name and stack frames are logged.
    logError("notification_send_threw", withoutMessage(error), {
      notificationId: notification.id,
      channel: notification.channel,
    });
    return { result: { ok: false, code: "adapter_error", retryable: true } };
  }
}

/**
 * Addresses one notice. Consent and opt-in are checked again here, not only at enqueue: a person
 * who turned a channel off or answered BAJA in the meantime gets nothing more on it.
 */
async function prepareDelivery(
  notification: ClaimedNotification,
  recipients: Recipients,
  appUrl: string,
): Promise<Delivery | { code: string }> {
  const emergency = recipients.emergencies.get(notification.emergencyId);
  if (!emergency) return { code: "invalid_payload" };
  const base = { notificationId: notification.id, urgent: notification.level === "important" };

  const render = async (localeTag: string | null) =>
    renderMessage({
      notificationId: notification.id,
      type: notification.type,
      payload: notification.payload,
      locale: matchLocale(localeTag, emergency.defaultLocale),
      emergency,
      appUrl,
    });

  if (notification.worksiteId !== null) {
    const contact = recipients.contacts.get(notification.worksiteId);
    // Consent to WhatsApp also covers its SMS fallback; consent to SMS never becomes WhatsApp.
    const isConsented =
      contact?.notifyChannel === notification.channel ||
      (contact?.notifyChannel === "whatsapp" && notification.channel === "sms");
    if (!contact?.phone || !isConsented) return { code: "no_consent" };
    if (notification.channel !== "sms" && notification.channel !== "whatsapp") return { code: "no_consent" };
    const message = await render(contact.locale);
    if (!message) return { code: "invalid_payload" };
    return { ...base, channel: notification.channel, phone: contact.phone, message };
  }

  const user = notification.userId === null ? undefined : recipients.users.get(notification.userId);
  if (!user) return { code: "no_address" };
  const channels = recipients.channels.get(user.id) ?? ["push"];
  if (!channels.includes(notification.channel)) return { code: "not_opted_in" };
  const message = await render(user.locale);
  if (!message) return { code: "invalid_payload" };

  switch (notification.channel) {
    case "push": {
      const subscriptions = recipients.subscriptions.get(user.id) ?? [];
      if (subscriptions.length === 0) return { code: "no_subscription" };
      return { ...base, channel: "push", subscriptions, message };
    }
    case "email":
      return user.email ? { ...base, channel: "email", email: user.email, message } : { code: "no_address" };
    case "sms":
    case "whatsapp":
      return user.phone
        ? { ...base, channel: notification.channel, phone: user.phone, message }
        : { code: "no_address" };
  }
}

function withoutMessage(error: unknown): Error {
  const safe = new Error(error instanceof Error ? error.name : "non_error");
  safe.name = safe.message;
  // V8 opens the stack with "name: message", and a message can span lines: keep only the frames.
  const frames =
    error instanceof Error
      ? error.stack?.split("\n").filter((line) => line.trimStart().startsWith("at "))
      : [];
  safe.stack = [safe.name, ...(frames ?? [])].join("\n");
  return safe;
}
