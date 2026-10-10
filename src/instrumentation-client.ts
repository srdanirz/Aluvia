import { publicEnv } from "@/shared/public-env";

// Runs before hydration. Each service loads in its own chunk and only when configured, so a
// visitor on 3G does not download Sentry or PostHog for a deployment that has them off.

// A chunk that fails to load (no signal) leaves that service off for the visit: there is
// nowhere to report it, and an unhandled rejection would only add noise.
const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  import("@/shared/observability/sentry-client")
    .then(({ startSentry }) => startSentry(dsn))
    .catch(() => undefined);
}

// Importing the module starts PostHog and its pageviews.
if (publicEnv.NEXT_PUBLIC_POSTHOG_KEY) import("@/shared/analytics/client").catch(() => undefined);
