"use client";

import { useLocale, useTranslations } from "next-intl";

import { languageNames } from "@/shared/i18n/language-names";
import { LOCALES } from "@/shared/i18n/locales";
import { Field, Input } from "@/shared/ui";

type LocalizedNameFieldsProps = {
  idPrefix: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  /** The language that must be filled; the others are optional and can be translated later. */
  requiredLocale: string;
  error?: string;
  label?: (language: string) => string;
};

/** One name field per app language, from the locale registry; adding a language adds a field. */
export function LocalizedNameFields({
  idPrefix,
  value,
  onChange,
  requiredLocale,
  error,
  label,
}: LocalizedNameFieldsProps) {
  const t = useTranslations("admin.common");
  const languageOf = languageNames(useLocale());
  return LOCALES.map((locale) => {
    const required = locale === requiredLocale;
    const language = languageOf(locale);
    return (
      <Field
        key={locale}
        id={`${idPrefix}-${locale}`}
        label={label ? label(language) : t("nameIn", { language })}
        hint={required ? t("nameRequiredHint") : t("optional")}
        error={required ? error : undefined}
      >
        <Input
          lang={locale}
          required={required}
          value={value[locale] ?? ""}
          onChange={(event) => onChange({ ...value, [locale]: event.target.value })}
        />
      </Field>
    );
  });
}
