import { type WebPushConfig, getWebPushConfig } from "@/shared/messaging/config";
import { sendWebPush } from "@/shared/messaging/web-push";

import type { ChannelAdapter } from "../types";

/**
 * Sends to every browser the person subscribed. Sent if any browser took it, so a retry never
 * repeats it on the others; failed for good when every subscription is gone.
 */
export function createPushAdapter(
  config: WebPushConfig | null = getWebPushConfig(),
): ChannelAdapter<"push"> | null {
  if (!config) return null;
  return {
    async send(delivery) {
      const { notificationId, message } = delivery;
      // The service worker shows title and body, and reports the open to mark the notice read.
      const payload = JSON.stringify({
        id: notificationId,
        title: message.title,
        body: message.body,
        url: message.url,
      });
      const results = await Promise.all(
        delivery.subscriptions.map((target) =>
          sendWebPush(target, payload, { urgent: delivery.urgent }, config),
        ),
      );
      const expiredEndpoints = delivery.subscriptions
        .filter((_, i) => results[i]?.ok === false && results[i].code === "subscription_expired")
        .map((s) => s.endpoint);
      if (results.some((r) => r.ok)) return { ok: true, expiredEndpoints };
      const retryable = results.find((r) => !r.ok && r.retryable);
      if (retryable) return { ...retryable, expiredEndpoints };
      return { ok: false, code: "no_subscription", retryable: false, expiredEndpoints };
    },
  };
}
