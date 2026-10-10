"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState, useSyncExternalStore } from "react";

import { languageNames } from "@/shared/i18n/language-names";
import { DEFAULT_LOCALE, LOCALES } from "@/shared/i18n/locales";
import { useRouter } from "@/shared/i18n/navigation";
import { Card, Field, Input, Select } from "@/shared/ui";

import { createEmergencyAction } from "../server/actions";
import { AreaFileField } from "./area-file-field";
import { FormStatus } from "./form-status";
import { LocalizedNameFields } from "./localized-name-fields";
import { SubmitButton } from "./submit-button";
import { useAdminAction } from "./use-admin-action";

type EmergencyFormProps = {
  disasterTypes: { key: string; name: string; workTypeCount: number }[];
  timeZones: string[];
};

const subscribeToNothing = () => () => {};
const readBrowserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Opens an emergency: name, address, type, languages, time zone, comunas, start and area. */
export function EmergencyForm({ disasterTypes, timeZones }: EmergencyFormProps) {
  const t = useTranslations("admin.emergencies");
  const languageOf = languageNames(useLocale());
  const router = useRouter();
  const { pending, submit, fieldError, formError, isStale } = useAdminAction(createEmergencyAction);

  // Generated once per form, so resubmitting after an error or a lost response is the same emergency.
  const [id] = useState(() => crypto.randomUUID());
  const [name, setName] = useState<Record<string, string>>({});
  const [defaultLocale, setDefaultLocale] = useState<string>(DEFAULT_LOCALE);
  const [chosenTimeZone, setTimeZone] = useState("");
  const [area, setArea] = useState<string | null>(null);

  // The admin's own zone is the likeliest default. The server snapshot is empty, so the
  // hydrated markup matches and the browser's zone fills in right after.
  const browserZone = useSyncExternalStore(subscribeToNothing, readBrowserZone, () => "");
  const timeZone = chosenTimeZone || (timeZones.includes(browserZone) ? browserZone : "");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (field: string) => String(form.get(field) ?? "");
    submit(
      {
        id,
        name,
        defaultLocale,
        timeZone,
        area,
        slug: text("slug"),
        disasterTypeKey: text("disasterTypeKey"),
        startedAt: text("startedAt"),
        comunas: text("comunas")
          .split(",")
          .map((comuna) => comuna.trim())
          .filter(Boolean),
      },
      (data) => router.push(`/admin/emergencies/${data.slug}`),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="gap-4">
        <LocalizedNameFields
          idPrefix="emergency-name"
          value={name}
          onChange={setName}
          requiredLocale={defaultLocale}
          error={fieldError("name")}
        />
        <Field id="emergency-slug" label={t("slugLabel")} hint={t("slugHint")} error={fieldError("slug")}>
          <Input name="slug" required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </Field>
        <Field id="emergency-type" label={t("typeLabel")} error={fieldError("disasterTypeKey")}>
          <Select name="disasterTypeKey" required defaultValue="">
            <option value="" disabled>
              {t("typePlaceholder")}
            </option>
            {disasterTypes.map((type) => (
              <option key={type.key} value={type.key} disabled={type.workTypeCount === 0}>
                {t("typeOption", { name: type.name, count: type.workTypeCount })}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="gap-4">
        <Field
          id="emergency-locale"
          label={t("localeLabel")}
          hint={t("localeHint")}
          error={fieldError("defaultLocale")}
        >
          <Select value={defaultLocale} onChange={(event) => setDefaultLocale(event.target.value)}>
            {LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {languageOf(locale)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="emergency-time-zone" label={t("timeZoneLabel")} error={fieldError("timeZone")}>
          <Select value={timeZone} onChange={(event) => setTimeZone(event.target.value)} required>
            <option value="" disabled>
              {t("timeZoneLabel")}
            </option>
            {timeZones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="emergency-started-at"
          label={t("startedAtLabel")}
          hint={t("startedAtHint")}
          error={fieldError("startedAt")}
        >
          <Input name="startedAt" type="datetime-local" required />
        </Field>
        <Field
          id="emergency-comunas"
          label={t("comunasLabel")}
          hint={t("comunasHint")}
          error={fieldError("comunas")}
        >
          <Input name="comunas" />
        </Field>
        <AreaFileField id="emergency-area" onChange={setArea} error={fieldError("area")} />
      </Card>

      <div className="flex flex-col gap-3">
        <SubmitButton pending={pending}>{t("create")}</SubmitButton>
        <FormStatus error={formError} isStale={isStale} />
      </div>
    </form>
  );
}
