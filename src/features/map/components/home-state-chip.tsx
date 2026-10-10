import { useTranslations } from "next-intl";

import { Chip } from "@/shared/ui";

import { type AttentionLevel, LEVEL_STATE, STATE_ICON, STATE_TONE } from "../attention";

/**
 * A home's public state (docs/DESIGN.md, "Estados de una casa") as a chip: icon, tone and name,
 * from its internal level. Every screen that names a home's state uses this, so the map, its
 * panels and Reportes speak the same four words.
 */
export function HomeStateChip({ level }: { level: AttentionLevel }) {
  const t = useTranslations("map.states");
  const state = LEVEL_STATE[level];
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={STATE_TONE[state]} icon={<Icon />}>
      {t(state)}
    </Chip>
  );
}
