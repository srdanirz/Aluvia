"use client";

import { useMapColorScheme } from "./google-maps-provider";

/**
 * Design tokens resolved to color values for Google's overlay options (fillColor, strokeColor),
 * which take a color, not a CSS variable. Client only, inside a loaded map. Subscribing to the
 * color scheme re-renders on a theme switch, so shapes follow light and dark (DESIGN.md, Temas).
 */
export function useTokenColors<T extends string>(tokens: readonly T[]): Record<T, string> {
  useMapColorScheme();
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    tokens.map((token) => [token, style.getPropertyValue(`--${token}`).trim()]),
  ) as Record<T, string>;
}
