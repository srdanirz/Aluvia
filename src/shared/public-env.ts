/**
 * Configuration the browser also reads. Next inlines NEXT_PUBLIC_ values at build time, so each
 * one is referenced by its full name. Plain reads on purpose: this file ships in the first
 * bundle, and zod would add ~30 KB gzip for every visitor. next.config.ts validates the same
 * variables with zod, so a malformed value fails the build, never a page. Every service here is
 * optional: unset, it stays off and the app works without it (ADR 0008).
 */
export const publicEnv = {
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY || undefined,
  // EU region by default (ADR 0008).
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
  // Without both, the map shows its list fallback (ADR 0006, 0011).
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined,
  NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
};
