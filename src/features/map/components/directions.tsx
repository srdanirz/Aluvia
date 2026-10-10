"use client";

import { useTranslations } from "next-intl";

import { track } from "@/shared/analytics/client";
import { Button, ButtonGroup } from "@/shared/ui";

type LatLng = { lat: number; lng: number };

// Each app's documented universal link: it opens the app when installed, the website otherwise.
// No key and no API call. Six decimals is about 10 cm: the door, without float noise.
const coordinates = ({ lat, lng }: LatLng) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
const APPS = [
  {
    key: "googleMaps",
    url: (point: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${coordinates(point)}`,
  },
  { key: "waze", url: (point: LatLng) => `https://waze.com/ul?ll=${coordinates(point)}&navigate=yes` },
  { key: "appleMaps", url: (point: LatLng) => `https://maps.apple.com/?daddr=${coordinates(point)}` },
] as const;

/**
 * "Cómo llegar" to a point in the navigation app the person already uses: a home, or a collection
 * point (features/collection-points), each counted under its own event.
 */
export function Directions({
  point,
  event = "worksite_directions_opened",
}: {
  point: LatLng;
  event?: "worksite_directions_opened" | "collection_point_directions_opened";
}) {
  const t = useTranslations("worksite");
  return (
    <ButtonGroup label={t("directions")} className="w-full justify-between">
      {APPS.map(({ key, url }) => (
        <Button key={key} variant="ghost" size="compact" className="flex-1" asChild>
          <a href={url(point)} target="_blank" rel="noreferrer" onClick={() => track(event, { app: key })}>
            {t(key)}
          </a>
        </Button>
      ))}
    </ButtonGroup>
  );
}
