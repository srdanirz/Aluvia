import { metrics, trace, type Meter } from "@opentelemetry/api";
import type { ReadableSpan, Span, SpanProcessor } from "@opentelemetry/sdk-trace-node";

/**
 * The app's only meter. Features create their instruments from it at module level
 * (`meter.createCounter("aluvia.map.bbox.requests")`); instrumentation.ts registers the provider
 * before any app module loads. With METRICS_PORT unset every instrument is a no-op.
 * Labels are routes, zones, work types or states: never a user or home id (STYLEGUIDE).
 */
export const meter = metrics.getMeter("aluvia");

// 0.8 s is a bucket edge so the map's p95 alert (ADR 0008) reads exact, not interpolated.
const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 0.8, 1, 2.5, 5, 10];
const QUERY_BUCKETS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55];

// Span Next.js opens around every request (OpenTelemetry guide, "Default Spans in Next.js").
const REQUEST_SPAN_TYPE = "BaseServer.handleRequest";

type InFlightRequest = { queries: number; spanIds: string[] };

// Every live span of a request, by span id, pointing to that request's entry. Keyed by span
// and never by trace id: the trace id comes from the client's traceparent, so two requests can
// share it. The db client lives in the app bundle and the span processor in the
// instrumentation bundle, so the map is shared through globalThis. A request's spans leave the
// map together when its root span ends (a child can end while code still runs in its context),
// so the map never outgrows the requests in flight.
const IN_FLIGHT = Symbol.for("aluvia.inFlightRequests");

function requestsBySpan(): Map<string, InFlightRequest> {
  const store = globalThis as { [IN_FLIGHT]?: Map<string, InFlightRequest> };
  return (store[IN_FLIGHT] ??= new Map());
}

/** Drizzle logger hook: counts one query against the request it runs in. */
export function countRequestQuery(): void {
  const spanId = trace.getActiveSpan()?.spanContext().spanId;
  const request = spanId ? requestsBySpan().get(spanId) : undefined;
  if (request) request.queries += 1;
}

/**
 * Turns the root span of every request into request metrics: duration and database queries,
 * by method, route pattern and status. Prometheus derives rate and error ratio from the
 * histogram count, so there is no separate counter.
 */
export function createRequestMetrics(source: Meter): SpanProcessor {
  const duration = source.createHistogram("aluvia.http.server.duration", {
    unit: "s",
    description: "Time to serve a request, by route pattern",
    advice: { explicitBucketBoundaries: DURATION_BUCKETS },
  });
  const queries = source.createHistogram("aluvia.http.server.db_queries", {
    unit: "{query}",
    description: "Database queries issued while serving one request",
    advice: { explicitBucketBoundaries: QUERY_BUCKETS },
  });

  return {
    onStart(span: Span) {
      const requests = requestsBySpan();
      const spanId = span.spanContext().spanId;
      if (span.attributes["next.span_type"] === REQUEST_SPAN_TYPE) {
        requests.set(spanId, { queries: 0, spanIds: [spanId] });
        return;
      }
      const parentId = span.parentSpanContext?.spanId;
      const request = parentId ? requests.get(parentId) : undefined;
      if (!request) return;
      request.spanIds.push(spanId);
      requests.set(spanId, request);
    },
    onEnd(span: ReadableSpan) {
      if (span.attributes["next.span_type"] !== REQUEST_SPAN_TYPE) return;
      const requests = requestsBySpan();
      const request = requests.get(span.spanContext().spanId);
      for (const id of request?.spanIds ?? []) requests.delete(id);
      // Next.js sets next.route on the root span only when it ends, so labels are read here.
      const queryCount = request?.queries ?? 0;

      const labels = {
        method: String(span.attributes["http.method"] ?? "unknown"),
        // The pattern (`/[locale]/emergencies/[slug]`), never the URL: bounded cardinality.
        route: String(span.attributes["next.route"] ?? "unmatched"),
        status_code: String(span.attributes["http.status_code"] ?? "unknown"),
      };
      const [seconds, nanos] = span.duration;
      duration.record(seconds + nanos / 1e9, labels);
      queries.record(queryCount, labels);
    },
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  };
}
