"use client";

import { LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, Card, Chip, Field, Input } from "@/shared/ui";

import type { LocationState } from "./use-current-location";

type LocationCardProps = {
  location: LocationState;
  onRetry: () => void;
  addressText: string;
  onAddressChange: (value: string) => void;
};

/** The GPS state, and the written address when there is no fix (ADR 0006: the report works without a map). */
export function LocationCard({ location, onRetry, addressText, onAddressChange }: LocationCardProps) {
  const t = useTranslations("worksites.report.location");
  const missing = location.status === "denied" || location.status === "unavailable";
  const approximate = location.status === "approximate";
  // While the phone looks for a fix (or waits on the permission prompt) the address is already
  // there to type, so nobody waits on the GPS to report.
  const locating = location.status === "locating";

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {locating ? (
          <Chip role="status">{t("locating")}</Chip>
        ) : location.status === "ready" ? (
          <Chip tone="done">{t("ready")}</Chip>
        ) : approximate ? (
          <Chip tone="pending">{t("approximate")}</Chip>
        ) : (
          <Chip tone="urgent">{t("missing")}</Chip>
        )}
        {location.status === "ready" || approximate ? (
          <span className="text-caption text-ink-muted">
            {t("accuracy", { meters: location.accuracyMeters })}
          </span>
        ) : null}
      </div>
      {missing || approximate || locating ? (
        <>
          <p className="text-body-sm text-ink-soft">
            {approximate ? t("approximateHelp") : locating ? t("locatingHelp") : t("missingHelp")}
          </p>
          <Field id="report-address" label={t("addressLabel")} hint={t("addressHint")}>
            <Input
              autoComplete="street-address"
              value={addressText}
              onChange={(event) => onAddressChange(event.target.value)}
            />
          </Field>
          {missing ? (
            <Button variant="secondary" onClick={onRetry} className="self-start">
              <LocateFixed aria-hidden />
              {t("retry")}
            </Button>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}
