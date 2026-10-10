import { hasLocale } from "next-intl";

import { DEFAULT_LOCALE, type Locale, LOCALES } from "./locales";

/**
 * The locale a Server Action works in. Actions cannot read it from the route (next/root-params
 * only exists while rendering), so the UI binds it; an unknown value falls back to the default.
 */
export function toActionLocale(value: unknown): Locale {
  return typeof value === "string" && hasLocale(LOCALES, value) ? value : DEFAULT_LOCALE;
}
