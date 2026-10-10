import * as webpush from "web-push";

import { getWebPushConfig, type WebPushConfig } from "./config";
import { NETWORK_FAILURE, PROVIDER_TIMEOUT_MS, type SendResult, failureFromStatus } from "./types";

/** A browser's push subscription as the Push API serializes it. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

// A notice older than a day is noise: the push service drops it instead of delivering it late.
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Sends one encrypted payload to one subscription (Web Push with VAPID, ADR 0010). A 404 or 410
 * means the browser dropped the subscription: the result says `subscription_expired` so the
 * caller deletes it.
 */
export async function sendWebPush(
  target: PushTarget,
  payload: string,
  // topic: up to 32 URL-safe characters; the push service keeps only the newest undelivered
  // message per topic, so a retried notice replaces its first copy instead of showing twice.
  options: { urgent: boolean; topic?: string },
  config: WebPushConfig | null = getWebPushConfig(),
): Promise<SendResult> {
  if (!config) return { ok: false, code: "channel_unavailable", retryable: false };
  try {
    await webpush.sendNotification(target, payload, {
      vapidDetails: {
        subject: config.VAPID_SUBJECT,
        publicKey: config.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: config.VAPID_PRIVATE_KEY,
      },
      TTL: TTL_SECONDS,
      urgency: options.urgent ? "high" : "normal",
      topic: options.topic,
      timeout: PROVIDER_TIMEOUT_MS,
    });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof webpush.WebPushError)) return NETWORK_FAILURE;
    if (error.statusCode === 404 || error.statusCode === 410) {
      return { ok: false, code: "subscription_expired", retryable: false };
    }
    return failureFromStatus(error.statusCode);
  }
}
