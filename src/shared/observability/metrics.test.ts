import { context, trace, TraceFlags } from "@opentelemetry/api";
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
  type HistogramMetricData,
} from "@opentelemetry/sdk-metrics";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { describe, expect, it } from "vitest";

import { countRequestQuery, createRequestMetrics } from "./metrics";

class TestReader extends MetricReader {
  constructor() {
    super({ aggregationTemporalitySelector: () => AggregationTemporality.CUMULATIVE });
  }
  protected onForceFlush() {
    return Promise.resolve();
  }
  protected onShutdown() {
    return Promise.resolve();
  }
}

const reader = new TestReader();
const provider = new NodeTracerProvider({
  spanProcessors: [createRequestMetrics(new MeterProvider({ readers: [reader] }).getMeter("test"))],
});
// Installs the AsyncLocalStorage context manager, as instrumentation.ts does in the app.
provider.register();
const tracer = provider.getTracer("test");

const inFlight = () =>
  (globalThis as Record<symbol, Map<string, unknown> | undefined>)[Symbol.for("aluvia.inFlightRequests")];

/** Simulates Next.js serving one request: a root span, a nested render span, N queries. */
function serveRequest(queries: number, parent = context.active()) {
  const root = tracer.startSpan(
    "GET /[locale]",
    { attributes: { "next.span_type": "BaseServer.handleRequest", "http.method": "GET" } },
    parent,
  );
  const rootContext = trace.setSpan(parent, root);
  const render = tracer.startSpan("render", {}, rootContext);
  context.with(trace.setSpan(rootContext, render), () => {
    for (let i = 0; i < queries; i++) countRequestQuery();
  });
  render.end();
  root.setAttributes({ "next.route": "/[locale]", "http.status_code": 200 });
  return root;
}

async function histogram(name: string) {
  const { resourceMetrics } = await reader.collect();
  const metric = resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .find((m) => m.descriptor.name === name) as HistogramMetricData | undefined;
  return metric?.dataPoints ?? [];
}

describe("createRequestMetrics", () => {
  it("records duration and queries by method, route pattern and status", async () => {
    serveRequest(3).end();

    const [point] = await histogram("aluvia.http.server.db_queries");
    expect(point?.attributes).toEqual({ method: "GET", route: "/[locale]", status_code: "200" });
    expect(point?.value.sum).toBe(3);
    expect(await histogram("aluvia.http.server.duration")).toHaveLength(1);
  });

  it("keeps two requests apart even when the client sends the same traceparent", async () => {
    const remote = trace.setSpanContext(context.active(), {
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      spanId: "00f067aa0ba902b7",
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });
    const before = (await histogram("aluvia.http.server.db_queries"))[0]?.value;
    const first = serveRequest(2, remote);
    const second = serveRequest(5, remote);
    first.end();
    second.end();

    const after = (await histogram("aluvia.http.server.db_queries"))[0]?.value;
    expect((after?.count ?? 0) - (before?.count ?? 0)).toBe(2);
    expect((after?.sum ?? 0) - (before?.sum ?? 0)).toBe(7);
  });

  it("leaves nothing behind once requests end", () => {
    serveRequest(1).end();
    expect(inFlight()?.size ?? 0).toBe(0);
  });

  it("ignores queries outside a request", () => {
    expect(() => countRequestQuery()).not.toThrow();
    expect(inFlight()?.size ?? 0).toBe(0);
  });
});
