import type { Messages } from "next-intl";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/** Interface copy for one locale, the same object next-intl renders pages with. */
export async function loadMessages(locale: Locale) {
  return (await import(`../../../messages/${locale}.json`)).default as Messages;
}

/**
 * The supported locale for a stored BCP 47 tag (`es-CL` resolves to `es`), else the fallback.
 * Server code that writes to a person in their language (notifications) resolves it here.
 */
export function matchLocale(tag: string | null | undefined, fallback: string = DEFAULT_LOCALE): Locale {
  const candidates = [tag, tag?.split("-")[0], fallback, fallback.split("-")[0]];
  return candidates.find((c): c is Locale => LOCALES.includes(c as Locale)) ?? DEFAULT_LOCALE;
}
