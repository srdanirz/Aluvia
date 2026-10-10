import { useTranslations } from "next-intl";

import { Chip } from "@/shared/ui";

import { HOME_STATES, STATE_ICON, STATE_TONE } from "../attention";

/** The map's key: the four public states with their icon and name, readable without color. */
export function MapLegend() {
  const t = useTranslations("map");
  return (
    <ul aria-label={t("legendLabel")} className="flex flex-wrap gap-2">
      {HOME_STATES.map((state) => {
        const Icon = STATE_ICON[state];
        return (
          <li key={state}>
            <Chip tone={STATE_TONE[state]} icon={<Icon />}>
              {t(`states.${state}`)}
            </Chip>
          </li>
        );
      })}
    </ul>
  );
}
