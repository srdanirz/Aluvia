"use client";

import { APILoadingStatus, APIProvider, ColorScheme, useApiLoadingStatus } from "@vis.gl/react-google-maps";
import { useLocale } from "next-intl";
import { type ReactNode, useSyncExternalStore } from "react";

import { publicEnv } from "@/shared/public-env";

/**
 * The one Google Maps loader of the app (ADR 0006). Wrap a layout with it once: the script loads
 * once per session and every map below shares it. Features render maps with `MAP_ID` and read
 * `useGoogleMapsStatus()` to show their fallback when the map cannot load.
 */

// Without them (a fork, local dev without a key) the app still works and maps report
// "unavailable", so their screen shows the fallback (ADR 0006, "Si el mapa no carga").
const API_KEY = publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
export const MAP_ID = publicEnv.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  if (!API_KEY || !MAP_ID) return children;
  return (
    <APIProvider apiKey={API_KEY} language={locale}>
      {children}
    </APIProvider>
  );
}

export type GoogleMapsStatus = "loading" | "ready" | "unavailable";

/**
 * Whether maps can render. `unavailable` covers a missing key, a failed load and a rejected key or
 * quota.
 */
export function useGoogleMapsStatus(): GoogleMapsStatus {
  const status = useApiLoadingStatus();
  if (!API_KEY || !MAP_ID) return "unavailable";
  if (status === APILoadingStatus.LOADED) return "ready";
  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) return "unavailable";
  return "loading";
}

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readColorScheme(): ColorScheme {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark") return ColorScheme.DARK;
  if (stamped === "light") return ColorScheme.LIGHT;
  return ColorScheme.FOLLOW_SYSTEM;
}

/**
 * The map color scheme for the app theme (DESIGN.md, Temas). Google applies it only when a map is
 * created, so a theme switch shows on the next map load, as ADR 0006 accepts.
 */
export function useMapColorScheme(): ColorScheme {
  return useSyncExternalStore(subscribeTheme, readColorScheme, () => ColorScheme.FOLLOW_SYSTEM);
}
