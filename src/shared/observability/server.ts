import "server-only";

import { metrics } from "@opentelemetry/api";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { MeterProvider } from "@opentelemetry/sdk-metrics";
import { AlwaysOnSampler, NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import type { Instrumentation } from "next";

import { env } from "@/shared/env";
import { publicEnv } from "@/shared/public-env";

import { captureConsole, logError, logInfo } from "./logger";
import { createRequestMetrics } from "./metrics";
import { sentryOptions } from "./sentry";

/**
 * Server side of ADR 0008, started once per process from instrumentation.ts. Each piece is
 * switched by its own variable and the app runs the same without any of them:
 * METRICS_PORT (Prometheus), NEXT_PUBLIC_SENTRY_DSN (Sentry). Tracing has no switch: it stays
 * in memory, exports nothing, and is what joins log lines and request metrics to a request.
 */
export async function startServerObservability(): Promise<void> {
  // Dev keeps Next.js's readable terminal output; its data is invented anyway.
  if (process.env.NODE_ENV === "production") captureConsole();

  const resource = resourceFromAttributes({ [ATTR_SERVICE_NAME]: "aluvia" });

  if (env.METRICS_PORT) {
    // Its own port, so /metrics is reachable by the Managed Prometheus sidecar inside the
    // Cloud Run instance and never through the public ingress.
    const exporter = new PrometheusExporter({ port: env.METRICS_PORT }, (error) => {
      if (error) logError("metrics_server_failed", error, { port: env.METRICS_PORT });
    });
    metrics.setGlobalMeterProvider(new MeterProvider({ resource, readers: [exporter] }));
  }

  // Always-on sampling: nothing is exported, and request metrics need every root span, also
  // when the load balancer forwarded an unsampled traceparent.
  new NodeTracerProvider({
    resource,
    sampler: new AlwaysOnSampler(),
    spanProcessors: [createRequestMetrics(metrics.getMeter("aluvia"))],
  }).register();

  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;
  if (dsn) {
    const Sentry = await import("@sentry/nextjs");
    // Our tracer provider owns OpenTelemetry and nothing traces, so Sentry needs neither its
    // provider nor its module hooks: it only reports errors. Sentry 11 keeps one scope per
    // request without OpenTelemetry: AsyncLocalStorage (NodeClient.init) plus Node's native
    // http.server.request.start channel, so concurrent requests never share breadcrumbs. The
    // SentryContextManager setup of earlier versions does not exist in 11.
    Sentry.init({
      ...sentryOptions(dsn),
      enableOpenTelemetrySetup: false,
      enableRuntimeChannelInjection: false,
    });
  }

  logInfo("observability_started", {
    metrics: env.METRICS_PORT !== undefined,
    errors: dsn !== undefined,
    analytics: publicEnv.NEXT_PUBLIC_POSTHOG_KEY !== undefined,
  });
}

/**
 * Every error Next.js catches while serving goes to Sentry. The log line is Next.js's own,
 * written right after this hook (next-server.js, instrumentationOnRequestError) and turned
 * into structured, redacted JSON by captureConsole, joined to the request by its trace.
 */
export async function reportRequestError(
  ...[error, request, context]: Parameters<Instrumentation.onRequestError>
): Promise<void> {
  if (publicEnv.NEXT_PUBLIC_SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    // It schedules its own flush. Next.js does not await this hook for App Router renders, so
    // the event can leave after the response: that needs CPU always allocated (ADR 0008).
    Sentry.captureRequestError(error, request, context);
  }
}
