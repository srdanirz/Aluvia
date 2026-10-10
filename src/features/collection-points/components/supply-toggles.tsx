"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { ToggleTile } from "@/shared/ui";

import type { SupplyOption } from "../server/collection-points";

/** What a point takes, picked by tapping the emergency's active supplies. */
export function SupplyToggles({
  supplyTypes,
  value,
  onChange,
}: {
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
        {t("acceptsLabel")}
      </p>
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
