import type { LocalizedText } from "@/shared/db/schema/types";

import { LOCALES } from "./locales";

/**
 * A jsonb name in the viewer's language, else in `fallbackLocale` (the emergency's default, or
 * the app's for platform-wide data such as disaster types), else in any language it has (ADR 0009).
 */
export function readLocalizedText(text: LocalizedText, locale: string, fallbackLocale: string): string {
  return text[locale] ?? text[fallbackLocale] ?? Object.values(text)[0] ?? "";
}

/** Active app languages the text has no translation for, so the admin can flag them. */
export function missingLocales(text: LocalizedText): string[] {
  return LOCALES.filter((locale) => !text[locale]);
}
