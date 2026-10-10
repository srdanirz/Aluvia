import "server-only";

import { createTranslator } from "next-intl";

import { DEFAULT_LOCALE, type Locale, LOCALES } from "@/shared/i18n/locales";

import type messagesShape from "../../../messages/es.json";
import { getTwilioConfig, getWhatsAppConfig } from "@/shared/messaging/config";
import { sendSms } from "@/shared/messaging/twilio";
import type { SendResult } from "@/shared/messaging/types";
import { sendWhatsAppTemplate } from "@/shared/messaging/whatsapp";
import { logWarn } from "@/shared/observability/logger";
import { meter } from "@/shared/observability/metrics";

export type LoginCodeMessage = { phone: string; code: string; locale: string };
export type LoginCodeSender = (message: LoginCodeMessage) => Promise<SendResult>;

// Alert (ADR 0013): failures over 20 % of attempts in 10 minutes, because then nobody can log in.
const deliveries = meter.createCounter("aluvia.auth.login_code.deliveries", {
  unit: "{message}",
  description: "Login code deliveries by channel (whatsapp, sms, console) and result (ok or an error code).",
});

function record(channel: "whatsapp" | "sms" | "console", result: SendResult): SendResult {
  deliveries.add(1, { channel, result: result.ok ? "ok" : result.code });
  if (!result.ok)
    logWarn("login_code_send_failed", { channel, code: result.code, retryable: result.retryable });
  return result;
}

// Meta authentication template (ADR 0013): Meta's fixed text with the code, plus a copy-code button.
const WHATSAPP_TEMPLATE = "login_code";

async function smsBody({ code, locale }: LoginCodeMessage): Promise<string> {
  const resolved = LOCALES.find((known) => known === locale) ?? DEFAULT_LOCALE;
  const messages = (await import(`../../../messages/${resolved}.json`)) as { default: typeof messagesShape };
  const t = createTranslator({
    locale: resolved as Locale,
    messages: messages.default,
    namespace: "auth.loginCode",
  });
  return t("sms", { code });
}

/**
 * Delivers a login code straight to the phone, outside the outbox (ADR 0013): it has to arrive in
 * seconds and must never sit in the database in clear text. WhatsApp first (cheaper, and what
 * people have open), SMS when WhatsApp is off or fails. With neither configured, which env.ts
 * only allows outside production, the code goes to the dev server log.
 */
export const sendLoginCode: LoginCodeSender = async (message) => {
  if (!getWhatsAppConfig() && !getTwilioConfig()) {
    process.stdout.write(`[login code] phone ending ${message.phone.slice(-2)}: ${message.code}\n`);
    return record("console", { ok: true });
  }
  const whatsapp = record(
    "whatsapp",
    await sendWhatsAppTemplate({
      to: message.phone,
      template: WHATSAPP_TEMPLATE,
      language: message.locale,
      bodyParams: [message.code],
      copyCodeButton: message.code,
    }),
  );
  if (whatsapp.ok) return whatsapp;
  const sms = record("sms", await sendSms({ to: message.phone, body: await smsBody(message) }));
  // When both fail, WhatsApp's reason is the one worth logging unless SMS was even attempted.
  return sms.ok || sms.code !== "channel_unavailable" ? sms : whatsapp;
};
