import { type TwilioConfig, getTwilioConfig } from "@/shared/messaging/config";
import { sendSms } from "@/shared/messaging/twilio";

import type { ChannelAdapter } from "../types";

/** `statusCallback` is our Twilio webhook, where a delivery that fails after acceptance is reported. */
export function createSmsAdapter(
  statusCallback: string,
  config: TwilioConfig | null = getTwilioConfig(),
): ChannelAdapter<"sms"> | null {
  if (!config) return null;
  return { send: ({ phone, message }) => sendSms({ to: phone, body: message.sms, statusCallback }, config) };
}
