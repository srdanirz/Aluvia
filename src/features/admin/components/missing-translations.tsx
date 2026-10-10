import { getLocale, getTranslations } from "next-intl/server";

import type { LocalizedText } from "@/shared/db/schema/types";
import { languageNames } from "@/shared/i18n/language-names";
import { missingLocales } from "@/shared/i18n/localized-text";
import { Chip } from "@/shared/ui";

/** Flags data names that lack an app language (ADR 0009); renders nothing when all are there. */
export async function MissingTranslations({ texts }: { texts: LocalizedText[] }) {
  const missing = [...new Set(texts.flatMap(missingLocales))];
  if (missing.length === 0) return null;
  const [t, locale] = await Promise.all([getTranslations("admin.common"), getLocale()]);
  const languageOf = languageNames(locale);
  const languages = new Intl.ListFormat([locale], { type: "conjunction" }).format(missing.map(languageOf));
  return (
    <Chip tone="neutral" className="self-start">
      {t("missingTranslations", { languages })}
    </Chip>
  );
}
