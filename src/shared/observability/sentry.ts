import type { Breadcrumb, BrowserOptions, ErrorEvent, NodeOptions } from "@sentry/nextjs";

import { redactText, redactValue, stripQuery } from "./redact";

// Headers worth sending: what device and what kind of body. Referer, cookies, forwarded IPs and
// the rest stay home.
const ALLOWED_HEADERS = ["user-agent", "content-type"];

/**
 * Sentry options shared by the browser and the server (ADR 0008). Sentry 11 collects users,
 * cookies, headers, bodies and query strings by default; `dataCollection` turns all of that off
 * at the source, and `beforeSend` scrubs what is left (messages, breadcrumbs, contexts) of
 * phones, emails, RUT, addresses and IPs. No tracing (metrics live in Prometheus), no replay.
 */
export function sentryOptions(dsn: string): BrowserOptions & NodeOptions {
  return {
    dsn,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ALLOWED_HEADERS }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
      queues: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSend: redactSentryEvent,
    beforeBreadcrumb: redactBreadcrumb,
  };
}

// Contexts the SDK fills with the device and runtime: names and versions, never a person.
// Every other context is redacted like any other data.
const SDK_CONTEXTS = new Set([
  "app",
  "browser",
  "cloud_resource",
  "culture",
  "device",
  "os",
  "runtime",
  "trace",
]);

/** Mutates and returns the event, as Sentry's beforeSend expects. Exported for its tests. */
export function redactSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = redactText(event.message);
  if (event.logentry) {
    if (event.logentry.message) event.logentry.message = redactText(event.logentry.message);
    if (event.logentry.params) event.logentry.params = redactValue(event.logentry.params) as unknown[];
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars;
      // A browser frame from an inline script carries the page URL, query included. Only the
      // query goes: redacting the path would turn hashed chunk names into "[phone]" and break
      // source map lookup.
      if (frame.filename) frame.filename = dropQuery(frame.filename);
      if (frame.abs_path) frame.abs_path = dropQuery(frame.abs_path);
    }
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(redactBreadcrumb);
  if (event.request) {
    const { request } = event;
    // Ids stay: they are how an error is traced back to a home. The query goes.
    if (request.url) request.url = stripQuery(request.url);
    delete request.query_string;
    delete request.cookies;
    delete request.data;
    if (request.headers) request.headers = pickHeaders(request.headers);
  }
  if (event.contexts) {
    for (const [name, context] of Object.entries(event.contexts)) {
      if (!context || SDK_CONTEXTS.has(name)) continue;
      const redacted = redactValue(context) as Record<string, unknown>;
      // captureRequestError stores the raw request path, query included, here.
      if (typeof redacted.request_path === "string")
        redacted.request_path = stripQuery(redacted.request_path);
      event.contexts[name] = redacted;
    }
  }
  // Only the anonymous id identifies a user; never email, name or IP.
  event.user = event.user?.id === undefined ? undefined : { id: event.user.id };
  if (event.extra) event.extra = redactValue(event.extra) as Record<string, unknown>;
  if (event.tags) event.tags = redactValue(event.tags) as ErrorEvent["tags"];
  return event;
}

function dropQuery(path: string): string {
  return path.replace(/[?#].*$/s, "");
}

function pickHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => ALLOWED_HEADERS.includes(name.toLowerCase())),
  );
}

// Where fetch, XHR and navigation breadcrumbs keep their URLs.
const BREADCRUMB_URL_KEYS = ["url", "from", "to"];
// Outgoing-request breadcrumbs keep the query apart (`http.query`, `url.query`).
const BREADCRUMB_QUERY_KEY = /(?:^|\.)(?:query|fragment)$/;

function redactBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data ? (redactValue(breadcrumb.data) as Record<string, unknown>) : undefined;
  if (data) {
    for (const key of Object.keys(data)) if (BREADCRUMB_QUERY_KEY.test(key)) delete data[key];
    for (const key of BREADCRUMB_URL_KEYS) {
      const value = data[key];
      if (typeof value === "string") data[key] = stripQuery(value);
    }
  }
  return {
    ...breadcrumb,
    ...(breadcrumb.message ? { message: redactText(breadcrumb.message) } : {}),
    ...(data ? { data } : {}),
  };
}
