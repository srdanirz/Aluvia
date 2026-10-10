import type { PostHog } from "posthog-js";

import { publicEnv } from "@/shared/public-env";

import { EVENTS, type EventName, type EventProperties } from "./events";
import { redactCapture } from "./redact-capture";

/**
 * Product events from the browser (ADR 0008). With NEXT_PUBLIC_POSTHOG_KEY unset every call is
 * a no-op. PostHog loads in its own chunk the first time this module is imported in the
 * browser; calls made before it finishes loading wait for it, none are lost.
 */
const posthog: Promise<PostHog | undefined> | undefined =
  typeof window !== "undefined" && publicEnv.NEXT_PUBLIC_POSTHOG_KEY
    ? startPosthog(publicEnv.NEXT_PUBLIC_POSTHOG_KEY, publicEnv.NEXT_PUBLIC_POSTHOG_HOST).catch(
        // The chunk did not load (no signal): analytics stay off for this visit. Rejecting would
        // raise one unhandled rejection per track() call instead.
        () => undefined,
      )
    : undefined;

async function startPosthog(key: string, host: string): Promise<PostHog> {
  const { posthog: client } = await import("posthog-js");
  client.init(key, {
    api_host: host,
    defaults: "2026-08-30",
    // ADR 0008, without exceptions. "Discard client IP data" is a project setting in PostHog.
    autocapture: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
    // On by default for localhost, and it creates a person profile for an anonymous visitor.
    internal_or_test_user_hostname: null,
    before_send: redactCapture,
    // Screens used, without anything the visitor typed or clicked on.
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    capture_performance: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    // Sentry reports errors; flags, surveys and the rest are unused and would load more code.
    capture_exceptions: false,
    advanced_disable_flags: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    mask_personal_data_properties: true,
    // No cookies: the anonymous id lives in localStorage and never travels with requests.
    persistence: "localStorage",
  });
  return client;
}

/** Sends a catalog event. Invalid properties throw outside production and are dropped in it. */
export function track<Name extends EventName>(name: Name, properties: EventProperties<Name>): void {
  const parsed = EVENTS[name].safeParse(properties);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") throw parsed.error;
    return;
  }
  void posthog?.then((client) => client?.capture(name, parsed.data));
}

/**
 * Ties the following events to a signed-in user: their anonymous id (users.id), role and
 * emergency. Never an email, phone or name.
 */
export function identifyUser(user: { userId: string; role: string; emergencyId: string }): void {
  void posthog?.then((client) =>
    client?.identify(user.userId, { role: user.role, emergencyId: user.emergencyId }),
  );
}

/** On sign-out, so the next person on a shared phone is not counted as the previous one. */
export function resetAnalytics(): void {
  void posthog?.then((client) => client?.reset());
}
