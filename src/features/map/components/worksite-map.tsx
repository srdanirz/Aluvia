"use client";

import { Map, type MapEvent } from "@vis.gl/react-google-maps";
import { useEffect, useRef, useState } from "react";

import { MAP_ID, useGoogleMapsStatus, useMapColorScheme } from "@/shared/maps/google-maps-provider";
import { Skeleton } from "@/shared/ui";

import { type Bbox, FIT_PADDING, snapBbox } from "../grid";
import type { AreaPolygon } from "../server/map-emergency";
import { CellsLayer } from "./cells-layer";
import type { Viewport } from "./fetch-cells";
import { startTilesWatchdog } from "../tiles-watchdog";
import { MapFallbackList } from "./map-fallback-list";

const WORLD = { west: -180, south: -85, east: 180, north: 85 };
// An emergency with one home has a zero-area extent and the map would open at maximum zoom; open
// on a few blocks around it instead.
const MIN_SPAN_DEGREES = 0.004;

function withMinimumSpan({ west, south, east, north }: Bbox): Bbox {
  const padX = Math.max(0, (MIN_SPAN_DEGREES - (east - west)) / 2);
  const padY = Math.max(0, (MIN_SPAN_DEGREES - (north - south)) / 2);
  return { west: west - padX, south: south - padY, east: east + padX, north: north + padY };
}

/**
 * Whether the map is drawing. `timedOut` when no tiles arrived in time; it clears if tiles arrive
 * later (slow 3G), since the map stays mounted behind the list.
 */
function useTilesWatchdog(ready: boolean) {
  const [timedOut, setTimedOut] = useState(false);
  const watchdog = useRef<ReturnType<typeof startTilesWatchdog> | null>(null);
  useEffect(() => {
    if (!ready) return;
    watchdog.current = startTilesWatchdog(() => setTimedOut(true));
    return watchdog.current.cancel;
  }, [ready]);
  return {
    timedOut,
    loaded: () => {
      watchdog.current?.loaded();
      setTimedOut(false);
    },
  };
}

/**
 * The emergency on Google Maps: its homes or its zones, grouped by the server for what is on
 * screen.
 */
export function WorksiteMap({
  slug,
  bounds,
  area,
}: {
  slug: string;
  bounds: Bbox | null;
  area: AreaPolygon[] | null;
}) {
  const status = useGoogleMapsStatus();
  const colorScheme = useMapColorScheme();
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const tiles = useTilesWatchdog(status === "ready");

  if (status === "unavailable") return <MapFallbackList slug={slug} bounds={bounds} reason="unavailable" />;
  if (status === "loading") return <Skeleton className="size-full rounded-none" />;

  return (
    <div className="relative size-full">
      <Map
        mapId={MAP_ID}
        colorScheme={colorScheme}
        defaultBounds={{ ...withMinimumSpan(bounds ?? WORLD), padding: FIT_PADDING }}
        gestureHandling="greedy"
        disableDefaultUI
        clickableIcons={false}
        reuseMaps
        className="size-full"
        onTilesLoaded={tiles.loaded}
        onIdle={(event: MapEvent) => {
          const mapBounds = event.map.getBounds()?.toJSON();
          const zoom = event.map.getZoom();
          if (mapBounds && zoom !== undefined)
            setViewport({ zoom: Math.round(zoom), bbox: snapBbox(mapBounds, Math.round(zoom)) });
        }}
      >
        {viewport ? <CellsLayer slug={slug} viewport={viewport} area={area} paused={tiles.timedOut} /> : null}
      </Map>
      {tiles.timedOut ? (
        <div className="absolute inset-0">
          <MapFallbackList slug={slug} bounds={bounds} reason="no_tiles" />
        </div>
      ) : null}
    </div>
  );
}
