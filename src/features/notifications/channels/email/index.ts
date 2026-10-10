import { type ResendConfig, getResendConfig } from "@/shared/messaging/config";
import { sendEmail } from "@/shared/messaging/resend";

import type { ChannelAdapter } from "../types";

export function createEmailAdapter(
  config: ResendConfig | null = getResendConfig(),
): ChannelAdapter<"email"> | null {
  if (!config) return null;
  return {
    send: ({ notificationId, email, message }) =>
      sendEmail(
        {
          to: email,
          subject: message.title,
          text: `${message.body}\n\n${message.url}`,
          idempotencyKey: notificationId,
        },
        config,
      ),
  };
}
