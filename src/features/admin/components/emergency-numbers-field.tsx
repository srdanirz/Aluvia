"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, Field, IconButton, Input, Label } from "@/shared/ui";

import { LocalizedNameFields } from "./localized-name-fields";

export type EmergencyNumberRow = { rowId: number; label: Record<string, string>; phone: string };

type EmergencyNumbersFieldProps = {
  rows: EmergencyNumberRow[];
  onChange: (rows: EmergencyNumberRow[]) => void;
  /** The emergency's default language: the label must exist in it. */
  defaultLocale: string;
  nextRowId: number;
  fieldError: (path: string) => string | undefined;
};

/**
 * The numbers the report and the bot show first to someone in danger (ambulance, firefighters,
 * police). Official numbers only: this is configuration, never a person's phone.
 */
export function EmergencyNumbersField({
  rows,
  onChange,
  defaultLocale,
  nextRowId,
  fieldError,
}: EmergencyNumbersFieldProps) {
  const t = useTranslations("admin.emergencies");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>{t("numbersLabel")}</Label>
        <p className="text-caption text-ink-muted">{t("numbersHint")}</p>
      </div>
      {rows.map((row, index) => (
        <div key={row.rowId} className="flex flex-col gap-4 rounded-control bg-surface-muted p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body-sm font-medium text-ink">{t("numberTitle", { number: index + 1 })}</p>
            <IconButton
              variant="ghost"
              label={t("numberRemove", { number: index + 1 })}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </IconButton>
          </div>
          <Field
            id={`number-${row.rowId}-phone`}
            label={t("numberPhone")}
            error={fieldError(`emergencyNumbers.${index}.phone`)}
          >
            <Input
              type="tel"
              inputMode="tel"
              value={row.phone}
              onChange={(event) =>
                onChange(rows.map((r, i) => (i === index ? { ...r, phone: event.target.value } : r)))
              }
            />
          </Field>
          <LocalizedNameFields
            idPrefix={`number-${row.rowId}-label`}
            value={row.label}
            onChange={(label) => onChange(rows.map((r, i) => (i === index ? { ...r, label } : r)))}
            requiredLocale={defaultLocale}
            error={fieldError(`emergencyNumbers.${index}.label`)}
            label={(language) => t("numberLabelIn", { language })}
          />
        </div>
      ))}
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => onChange([...rows, { rowId: nextRowId, label: {}, phone: "" }])}
      >
        <Plus aria-hidden />
        {t("numberAdd")}
      </Button>
    </div>
  );
}
