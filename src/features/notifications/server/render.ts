import { createTranslator } from "next-intl";

import { type Locale } from "@/shared/i18n/locales";
import { loadMessages } from "@/shared/i18n/messages";

import { NOTIFICATION_TYPES, isNotificationType } from "../catalog";
import type { RenderedMessage } from "../channels/types";
import { notificationLink } from "./links";

// Shift times read as "sábado 11 de octubre, 09:00" in the emergency's time zone.
const FORMATS = {
  dateTime: {
    shift: { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" },
  },
} as const;

/**
 * Writes a notice in the recipient's language from `messages/<locale>.json`, under
 * `notifications.<type>`. Returns null when the stored type or params no longer match the catalog,
 * which the dispatcher closes as `invalid_payload` instead of retrying forever.
 */
export async function renderMessage(input: {
  notificationId: string;
  type: string;
  payload: Record<string, string>;
  locale: Locale;
  emergency: { timeZone: string };
  appUrl: string;
}): Promise<RenderedMessage | null> {
  if (!isNotificationType(input.type)) return null;
  const definition = NOTIFICATION_TYPES[input.type];
  const parsed = definition.params.safeParse(input.payload);
  if (!parsed.success) return null;
  const params = parsed.data as Record<string, string>;

  const url = notificationLink(input.appUrl, input.notificationId);
  const dates = ("dates" in definition ? definition.dates : []) as readonly string[];
  const numbers = ("numbers" in definition ? definition.numbers : []) as readonly string[];
  const values: Record<string, string | number | Date> = { ...params, url };
  for (const key of dates) values[key] = new Date(params[key] ?? "");
  for (const key of numbers) values[key] = Number(params[key]);

  const messages = await loadMessages(input.locale);
  let isBroken = false;
  const t = createTranslator({
    locale: input.locale,
    messages: messages.notifications as Record<string, Record<string, string>>,
    timeZone: input.emergency.timeZone,
    formats: FORMATS,
    // By default a missing key or a broken ICU message renders the key itself, which would then be
    // sent to a person. Flag it instead and close the notice as invalid_payload.
    onError: () => {
      isBroken = true;
    },
  });
  const text = (key: string) => t(`${input.type}.${key}` as never, values as never);
  const message = {
    type: input.type,
    locale: input.locale,
    title: text("title"),
    body: text("body"),
    sms: text("sms"),
    url,
  };
  return isBroken ? null : message;
}
