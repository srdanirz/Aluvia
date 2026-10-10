"use client";

import { Map, type MapEvent } from "@vis.gl/react-google-maps";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { MAP_ID, useGoogleMapsStatus, useMapColorScheme } from "@/shared/maps/google-maps-provider";
import { Skeleton } from "@/shared/ui";

import { type Bbox, snapBbox } from "../grid";
import type { AreaPolygon } from "../server/map-emergency";
import { CellsLayer } from "./cells-layer";
import type { Viewport } from "./fetch-cells";
import { startTilesWatchdog } from "../tiles-watchdog";
import { MapControlsColumn } from "./map-controls";
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
 * Room around the fitted area for what floats over the map, so the emergency opens framed in the
 * visible part: on a phone the panel takes the lower part and the nav the bottom; from tablet up
 * the panel sits on the left and the nav on top. Read once, at mount, like the default bounds.
 */
function fitPadding(): google.maps.Padding {
  if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches)
    return { top: 112, right: 48, bottom: 48, left: 400 };
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  return { top: 96, right: 24, bottom: Math.round(height * 0.4), left: 24 };
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
  timeZone,
  overlay,
}: {
  slug: string;
  bounds: Bbox | null;
  area: AreaPolygon[] | null;
  timeZone: string;
  /**
   * Drawn inside the map, over the homes: the emergency's zones (features/zones) and collection
   * points (features/collection-points). Their controls go in one column through `MapControl`.
   */
  overlay?: ReactNode;
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
        defaultBounds={{ ...withMinimumSpan(bounds ?? WORLD), padding: fitPadding() }}
        gestureHandling="greedy"
        // The arrow, not Google's open hand: the map reads as a page to tap, not a canvas to grab.
        draggableCursor="default"
        draggingCursor="default"
        disableDefaultUI
        clickableIcons={false}
        // Drops Google's "Keyboard shortcuts" link; the data and terms credits must stay (Maps Platform terms).
        keyboardShortcuts={false}
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
        {viewport ? (
          <CellsLayer
            slug={slug}
            viewport={viewport}
            area={area}
            timeZone={timeZone}
            paused={tiles.timedOut}
          />
        ) : null}
        {overlay ? <MapControlsColumn>{overlay}</MapControlsColumn> : null}
      </Map>
      {tiles.timedOut ? (
        <div className="absolute inset-0">
          <MapFallbackList slug={slug} bounds={bounds} reason="no_tiles" />
        </div>
      ) : null}
    </div>
  );
}
