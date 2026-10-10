"use client";

import { type Messages, useTranslations } from "next-intl";

export type ErrorCode = keyof Messages["errors"];

/**
 * Translates a server error code (STYLEGUIDE: the server answers codes, never sentences). A code
 * this client does not know yet, from a newer server, reads as the generic `unknown` message.
 */
export function useErrorMessage(): (code: string) => string {
  const t = useTranslations("errors");
  return (code) => (t.has(code as ErrorCode) ? t(code as ErrorCode) : t("unknown"));
}
