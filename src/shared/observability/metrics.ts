import { metrics } from "@opentelemetry/api";

// TODO(#23): stub of feat/observability's module, same export. Its SDK registration turns this
// no-op meter into the Prometheus exporter without touching callers.
export const meter = metrics.getMeter("aluvia");
