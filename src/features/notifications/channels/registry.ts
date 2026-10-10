import { createEmailAdapter } from "./email";
import { createPushAdapter } from "./push";
import { createSmsAdapter } from "./sms";
import { createWhatsAppAdapter } from "./whatsapp";
import type { ChannelAdapters } from "./types";

// Where Twilio posts incoming SMS and delivery status (src/app/api/v1/webhooks/twilio/route.ts).
export const TWILIO_WEBHOOK_PATH = "/api/v1/webhooks/twilio";

/**
 * The configured channels. A channel whose provider is not configured is absent, and its notices
 * close with `channel_unavailable` (ADR 0010). Adding a channel is one folder and one line here.
 */
export function createChannelAdapters(appUrl: string): ChannelAdapters {
  return {
    push: createPushAdapter() ?? undefined,
    email: createEmailAdapter() ?? undefined,
    sms: createSmsAdapter(`${appUrl}${TWILIO_WEBHOOK_PATH}`) ?? undefined,
    whatsapp: createWhatsAppAdapter() ?? undefined,
  };
}
