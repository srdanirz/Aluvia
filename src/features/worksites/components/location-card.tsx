"use client";

import { LocateFixed } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, Card, Chip, Field, Input, Spinner } from "@/shared/ui";

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

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {location.status === "locating" ? (
          <Chip>
            <Spinner label={t("locating")} />
            {t("locating")}
          </Chip>
        ) : location.status === "ready" ? (
          <Chip tone="done">{t("ready")}</Chip>
        ) : (
          <Chip tone="urgent">{t("missing")}</Chip>
        )}
        {location.status === "ready" ? (
          <span className="text-caption text-ink-muted">
            {t("accuracy", { meters: location.accuracyMeters })}
          </span>
        ) : null}
      </div>
      {missing ? (
        <>
          <p className="text-body-sm text-ink-soft">{t("missingHelp")}</p>
          <Field id="report-address" label={t("addressLabel")} hint={t("addressHint")}>
            <Input
              autoComplete="street-address"
              value={addressText}
              onChange={(event) => onAddressChange(event.target.value)}
            />
          </Field>
          <Button variant="secondary" onClick={onRetry} className="self-start">
            <LocateFixed aria-hidden />
            {t("retry")}
          </Button>
        </>
      ) : null}
    </Card>
  );
}
