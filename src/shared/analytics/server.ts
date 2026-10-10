import "server-only";

import { after } from "next/server";
import { PostHog } from "posthog-node";

import { logError } from "@/shared/observability/logger";
import { publicEnv } from "@/shared/public-env";

import { EVENTS, type EventName, type EventProperties } from "./events";

/**
 * Product events from Server Actions and route handlers, for outcomes only the server knows
 * (a code verified, a role approved). Call it after the commit. It never blocks the response:
 * the event is sent once the response is out, and a failed send is logged, not thrown. Invalid
 * properties throw outside production and are logged in it. With NEXT_PUBLIC_POSTHOG_KEY unset
 * it is a no-op.
 */
export function trackServerEvent<Name extends EventName>(
  name: Name,
  properties: EventProperties<Name>,
  { distinctId }: { distinctId?: string } = {},
): void {
  const parsed = EVENTS[name].safeParse(properties);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") throw parsed.error;
    logError("analytics_event_invalid", parsed.error, { event: name });
    return;
  }
  const client = getClient();
  if (!client) return;

  const message = {
    event: name,
    distinctId,
    // Without a user there is no person to update: the event stays anonymous.
    properties: { ...parsed.data, $process_person_profile: distinctId !== undefined },
    disableGeoip: true,
  };
  const send = () =>
    client.captureImmediate(message).catch((error: unknown) => {
      logError("analytics_send_failed", error, { event: name });
    });
  try {
    // After the response: a slow PostHog never delays a volunteer. This needs Cloud Run with
    // CPU always allocated (ADR 0008); with request-based CPU, after() work stalls.
    after(send);
  } catch {
    // after() only exists inside a request; elsewhere (a script, a seed) send right away.
    void send();
  }
}

// Dev re-evaluates modules on edit; one client per process, not one per edit.
const globalForAnalytics = globalThis as unknown as { aluviaPosthog?: PostHog };

function getClient(): PostHog | undefined {
  const key = publicEnv.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return undefined;
  globalForAnalytics.aluviaPosthog ??= new PostHog(key, { host: publicEnv.NEXT_PUBLIC_POSTHOG_HOST });
  return globalForAnalytics.aluviaPosthog;
}
