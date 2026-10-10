import { type WhatsAppConfig, getWhatsAppConfig } from "@/shared/messaging/config";
import { sendWhatsAppTemplate } from "@/shared/messaging/whatsapp";

import type { ChannelAdapter } from "../types";

/** Each type has an approved template of its own name whose only parameter is the link (ADR 0010). */
export function createWhatsAppAdapter(
  config: WhatsAppConfig | null = getWhatsAppConfig(),
): ChannelAdapter<"whatsapp"> | null {
  if (!config) return null;
  return {
    send: ({ phone, message }) =>
      sendWhatsAppTemplate(
        { to: phone, template: message.type, language: message.locale, bodyParams: [message.url] },
        config,
      ),
  };
}
