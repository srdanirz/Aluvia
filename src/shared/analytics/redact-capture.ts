import type { CaptureResult } from "posthog-js";

import { redactText, redactUrl } from "@/shared/observability/redact";

// URLs anywhere, also nested ($initial_person_info keeps them under "u" and "r").
const URL_LIKE = /^(?:https?:\/\/|\/)/i;
// The page title can name a home or a person; the pathname already says which screen it was.
const DROPPED_PROPERTIES = new Set(["$title"]);

function redactProperty(value: unknown): unknown {
  if (typeof value === "string") return URL_LIKE.test(value) ? redactUrl(value) : redactText(value);
  if (Array.isArray(value)) return value.map(redactProperty);
  if (value && typeof value === "object") return redactProperties(value as Record<string, unknown>);
  return value;
}

function redactProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!DROPPED_PROPERTIES.has(key)) out[key] = redactProperty(value);
  }
  return out;
}

/**
 * PostHog `before_send`: record ids in URLs become ":id", query strings go, and any string
 * that slipped personal data is redacted (ADR 0008). Catalog properties are already ids and
 * enums; this covers what the SDK adds by itself.
 */
export function redactCapture(capture: CaptureResult | null): CaptureResult | null {
  if (!capture) return null;
  return {
    ...capture,
    properties: redactProperties(capture.properties),
    ...(capture.$set ? { $set: redactProperties(capture.$set) } : {}),
    ...(capture.$set_once ? { $set_once: redactProperties(capture.$set_once) } : {}),
  };
}
