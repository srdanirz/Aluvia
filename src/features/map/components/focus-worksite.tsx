"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";

import { useGoogleMapsStatus } from "@/shared/maps/google-maps-provider";

// Close enough to see the block and its neighbors, where every block is its own marker (grid.ts).
const FOCUS_ZOOM = 18;

type Point = { lat: number; lng: number };

/**
 * Centers the map on a home when its page opens, from a shared link or a tap. Renders nothing,
 * and does nothing without a loaded map. Zooms in only when the map is farther out.
 */
export function FocusWorksite(point: Point) {
  return useGoogleMapsStatus() === "ready" ? <PanTo {...point} /> : null;
}

function PanTo({ lat, lng }: Point) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 0) < FOCUS_ZOOM) map.setZoom(FOCUS_ZOOM);
  }, [map, lat, lng]);
  return null;
}
