"use client";

import { Polygon } from "@vis.gl/react-google-maps";

import { useTokenColors } from "@/shared/maps/theme-colors";

import type { AreaPolygon } from "../server/map-emergency";

const TOKENS = ["rain-600"] as const;

/** The official affected area, outlined in both map views so people see where the emergency is. */
export function AreaOutline({ area }: { area: AreaPolygon[] | null }) {
  const colors = useTokenColors(TOKENS);
  return area?.map((rings, index) => (
    <Polygon
      key={index}
      paths={rings}
      clickable={false}
      fillColor={colors["rain-600"]}
      fillOpacity={0.08}
      strokeColor={colors["rain-600"]}
      strokeOpacity={0.9}
      strokeWeight={2}
    />
  ));
}
