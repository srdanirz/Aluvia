"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { ToggleTile } from "@/shared/ui";

import type { SupplyOption } from "../server/collection-points";

/** A set of the emergency's active supplies picked by tapping: what a point takes, or has too much of. */
export function SupplyToggles({
  label,
  hint,
  supplyTypes,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  supplyTypes: SupplyOption[];
  value: string[];
  onChange: (keys: string[]) => void;
}) {
  const t = useTranslations("collectionPoints");
  const labelId = useId();
  const active = supplyTypes.filter((type) => type.isActive);
  return (
    <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
      <p id={labelId} className="text-body-sm font-medium text-ink">
        {label}
      </p>
      {hint ? <p className="text-caption text-ink-muted">{hint}</p> : null}
      {active.length === 0 ? (
        <p className="text-body-sm text-ink-soft">{t("acceptsEmpty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {active.map((type) => (
            <ToggleTile
              key={type.key}
              pressed={value.includes(type.key)}
              onPressedChange={(pressed) =>
                onChange(pressed ? [...value, type.key] : value.filter((key) => key !== type.key))
              }
            >
              {type.name}
            </ToggleTile>
          ))}
        </div>
      )}
    </div>
  );
}
