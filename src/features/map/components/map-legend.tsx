import { useTranslations } from "next-intl";

import { Chip } from "@/shared/ui";

import { ATTENTION_LEVELS, LEVEL_ICON, LEVEL_TONE } from "../attention";

/** Every attention level with its icon and name: the map's key, readable without color. */
export function MapLegend() {
  const t = useTranslations("map");
  return (
    <ul aria-label={t("legendLabel")} className="flex flex-wrap gap-2">
      {ATTENTION_LEVELS.map((level) => {
        const Icon = LEVEL_ICON[level];
        return (
          <li key={level}>
            <Chip tone={LEVEL_TONE[level]} icon={<Icon />}>
              {t(`levels.${level}`)}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}
