"use client";

import { useTranslations } from "next-intl";

import { Field, Input, SegmentedControl, ToggleTile } from "@/shared/ui";

import { DAMAGE_LEVELS, HAZARDS, type ReportDraft } from "./report-draft";

type ReportDetailsProps = {
  draft: ReportDraft;
  onChange: (update: (draft: ReportDraft) => ReportDraft) => void;
  phoneError: boolean;
  phoneIsValid: boolean;
};

/** Everything optional in a report, hidden until asked for (DESIGN.md: one thing per screen). */
export function ReportDetails({ draft, onChange, phoneError, phoneIsValid }: ReportDetailsProps) {
  const t = useTranslations("worksites.report.details");
  const tDamage = useTranslations("worksites.damage");
  const tHazard = useTranslations("worksites.hazard");
  const set = <K extends keyof ReportDraft>(key: K, value: ReportDraft[K]) =>
    onChange((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex flex-col gap-6">
      <ToggleTile
        pressed={draft.hasVulnerablePeople}
        onPressedChange={(pressed) => set("hasVulnerablePeople", pressed)}
      >
        {t("vulnerable")}
      </ToggleTile>

      <div role="group" aria-labelledby="report-damage" className="flex flex-col gap-3">
        <p id="report-damage" className="text-body-sm font-medium text-ink">
          {t("damage")}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {DAMAGE_LEVELS.map((level) => (
            <ToggleTile
              key={level}
              pressed={draft.damageLevel === level}
              onPressedChange={(pressed) => set("damageLevel", pressed ? level : null)}
            >
              {tDamage(level)}
            </ToggleTile>
          ))}
        </div>
      </div>

      <div role="group" aria-labelledby="report-hazards" className="flex flex-col gap-3">
        <p id="report-hazards" className="text-body-sm font-medium text-ink">
          {t("hazards")}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {HAZARDS.map((hazard) => (
            <ToggleTile
              key={hazard}
              pressed={draft.hazards.includes(hazard)}
              onPressedChange={(pressed) =>
                set(
                  "hazards",
                  pressed ? [...draft.hazards, hazard] : draft.hazards.filter((h) => h !== hazard),
                )
              }
            >
              {tHazard(hazard)}
            </ToggleTile>
          ))}
        </div>
        <p className="text-caption text-ink-muted">{t("hazardsHint")}</p>
      </div>

      <Field id="report-name" label={t("nameLabel")}>
        <Input autoComplete="name" value={draft.name} onChange={(event) => set("name", event.target.value)} />
      </Field>

      <Field
        id="report-phone"
        label={t("phoneLabel")}
        hint={draft.publicContact ? t("phoneHintPublic") : t("phoneHint")}
        error={phoneError ? t("phoneError") : undefined}
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={draft.phone}
          onChange={(event) => set("phone", event.target.value)}
        />
      </Field>

      <ToggleTile pressed={draft.publicContact} onPressedChange={(pressed) => set("publicContact", pressed)}>
        {t("publicContact")}
      </ToggleTile>

      {phoneIsValid ? (
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label={t("notifyLabel")}
            value={draft.notifyChannel}
            onChange={(value) => set("notifyChannel", value)}
            options={[
              { value: "none", label: t("notifyNone") },
              { value: "sms", label: t("notifySms") },
              { value: "whatsapp", label: t("notifyWhatsapp") },
            ]}
          />
          <p className="text-caption text-ink-muted">{t("notifyHint")}</p>
        </div>
      ) : null}
    </div>
  );
}
