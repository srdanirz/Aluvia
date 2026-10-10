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
};
