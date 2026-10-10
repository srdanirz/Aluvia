"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Card, Field, Input } from "@/shared/ui";

import { updateEmergencySettingsAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { type EmergencyNumberRow, EmergencyNumbersField } from "./emergency-numbers-field";
import { SubmitButton } from "./submit-button";
import { useAdminAction } from "./use-admin-action";

type EmergencySettingsFormProps = {
  emergencyId: string;
  disabled: boolean;
  settings: {
    version: number;
    smsDailyCap: number;
    whatsappDailyCap: number;
    neighborReserve: number;
    officialContact: string | null;
    officialSurveyName: string | null;
    emergencyNumbers: { label: Record<string, string>; phone: string }[];
  };
  defaultLocale: string;
};

const NUMBER_FIELDS = ["smsDailyCap", "whatsappDailyCap", "neighborReserve"] as const;

/**
 * Message caps, notice parameters (ADR 0007) and emergency numbers. Saving checks nobody else
 * saved in between.
 */
const numberRows = (numbers: EmergencySettingsFormProps["settings"]["emergencyNumbers"], firstId: number) =>
  numbers.map((number, i) => ({ ...number, rowId: firstId + i }));

export function EmergencySettingsForm({
  emergencyId,
  disabled,
  settings,
  defaultLocale,
}: EmergencySettingsFormProps) {
  const t = useTranslations("admin.emergencies");
  const router = useRouter();
  const { pending, result, submit, reset, fieldError, formError, isStale } = useAdminAction(
    updateEmergencySettingsAction,
  );
  const [version, setVersion] = useState(settings.version);
  const [numbers, setNumbers] = useState<EmergencyNumberRow[]>(() =>
    numberRows(settings.emergencyNumbers, 0),
  );
  // Row ids only grow, so a row added after a reload never reuses a removed row's id.
  const [nextRowId, setNextRowId] = useState(settings.emergencyNumbers.length);
  const [seenVersion, setSeenVersion] = useState(settings.version);
  // A newer version from the server that is not our own save (Reload after stale_version): adopt
  // it and drop the error. The fieldset below remounts on it, so the inputs show the new values.
  if (settings.version !== seenVersion) {
    setSeenVersion(settings.version);
    if (settings.version !== version) {
      setVersion(settings.version);
      setNumbers(numberRows(settings.emergencyNumbers, nextRowId));
      setNextRowId(nextRowId + settings.emergencyNumbers.length);
      reset();
    }
  }

  const labels = {
    smsDailyCap: t("smsLabel"),
    whatsappDailyCap: t("whatsappLabel"),
    neighborReserve: t("reserveLabel"),
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (field: string) => String(form.get(field) ?? "");
    // An empty or non-numeric field reaches the server as NaN and comes back as invalid_number.
    const number = (field: string) => (text(field).trim() === "" ? Number.NaN : Number(text(field)));
    submit(
      {
        emergencyId,
        version,
        smsDailyCap: number("smsDailyCap"),
        whatsappDailyCap: number("whatsappDailyCap"),
        neighborReserve: number("neighborReserve"),
        officialContact: text("officialContact"),
        officialSurveyName: text("officialSurveyName"),
        emergencyNumbers: numbers.map(({ label, phone }) => ({ label, phone })),
      },
      (data) => {
        setVersion(data.version);
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="gap-4">
        <fieldset key={settings.version} disabled={disabled} className="flex flex-col gap-4">
          <div className="grid items-start gap-4 md:grid-cols-2">
            {NUMBER_FIELDS.map((field) => (
              <div key={field} className={field === "neighborReserve" ? "md:col-span-2" : undefined}>
                <Field
                  id={`settings-${field}`}
                  label={labels[field]}
                  hint={field === "neighborReserve" ? t("reserveHint") : undefined}
                  error={fieldError(field)}
                >
                  <Input
                    name={field}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    defaultValue={settings[field]}
                  />
                </Field>
              </div>
            ))}
          </div>
          <Field
            id="settings-contact"
            label={t("contactLabel")}
            hint={t("contactHint")}
            error={fieldError("officialContact")}
          >
            <Input name="officialContact" defaultValue={settings.officialContact ?? ""} />
          </Field>
          <Field
            id="settings-survey"
            label={t("surveyLabel")}
            hint={t("surveyHint")}
            error={fieldError("officialSurveyName")}
          >
            <Input name="officialSurveyName" defaultValue={settings.officialSurveyName ?? ""} />
          </Field>
          <EmergencyNumbersField
            rows={numbers}
            onChange={(rows) => {
              setNumbers(rows);
              setNextRowId(Math.max(nextRowId, ...rows.map((row) => row.rowId + 1)));
            }}
            defaultLocale={defaultLocale}
            nextRowId={nextRowId}
            fieldError={fieldError}
          />
        </fieldset>
      </Card>
      {disabled ? null : (
        <div className="flex flex-col gap-3">
          <SubmitButton variant="secondary" pending={pending}>
            {t("save")}
          </SubmitButton>
          <FormStatus error={formError} isStale={isStale} saved={result?.ok === true} />
        </div>
      )}
    </form>
  );
}
