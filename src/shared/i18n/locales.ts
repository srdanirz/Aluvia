// Locale registry. Adding a language = one entry here + messages/<code>.json.
export const LOCALES = ["es", "en"] as const;
export const DEFAULT_LOCALE = "es";

export type Locale = (typeof LOCALES)[number];
