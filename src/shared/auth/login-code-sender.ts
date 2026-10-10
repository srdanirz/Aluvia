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

/** The providers a sender talks to; tests pass fakes, the app passes the real clients. */
export type LoginCodeChannels = {
  whatsapp: ((message: LoginCodeMessage) => Promise<SendResult>) | null;
  sms: ((message: LoginCodeMessage) => Promise<SendResult>) | null;
};

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

// Meta authentication template (ADR 0013): Meta's fixed text with the code and a copy-code
// button. Approved in Spanish only for now, so every code goes out in "es".
const WHATSAPP_TEMPLATE = "aluvia_login_code";
const WHATSAPP_TEMPLATE_LANGUAGE = "es";

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
 * Builds the sender: WhatsApp first (cheaper, and what people have open), SMS when WhatsApp
 * fails for any reason (no WhatsApp on that number, a template rejected, our token revoked).
 * With no channel at all, which env.ts only allows outside production, the code goes to the dev
 * server log. When every channel fails, WhatsApp's reason is returned unless SMS was tried.
 */
export function createLoginCodeSender(channels: LoginCodeChannels): LoginCodeSender {
  return async (message) => {
    if (!channels.whatsapp && !channels.sms) {
      process.stdout.write(`[login code] phone ending ${message.phone.slice(-2)}: ${message.code}\n`);
      return record("console", { ok: true });
    }
    const whatsapp = channels.whatsapp
      ? record("whatsapp", await channels.whatsapp(message))
      : ({ ok: false, code: "channel_unavailable", retryable: false } as const);
    if (whatsapp.ok || !channels.sms) return whatsapp;
    const sms = record("sms", await channels.sms(message));
    return sms;
  };
}

/**
 * Delivers a login code straight to the phone, outside the outbox (ADR 0013): it has to arrive in
 * seconds and must never sit in the database in clear text.
 */
export const sendLoginCode: LoginCodeSender = createLoginCodeSender({
  whatsapp: getWhatsAppConfig()
    ? ({ phone, code }) =>
        sendWhatsAppTemplate({
          to: phone,
          template: WHATSAPP_TEMPLATE,
          language: WHATSAPP_TEMPLATE_LANGUAGE,
          bodyParams: [code],
          copyCodeButton: code,
        })
    : null,
  sms: getTwilioConfig()
    ? async (message) => sendSms({ to: message.phone, body: await smsBody(message) })
    : null,
});
