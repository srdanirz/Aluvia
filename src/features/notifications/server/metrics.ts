import { metrics } from "@opentelemetry/api";

/**
 * Outbox metrics (ADR 0008). Without an OpenTelemetry SDK registered these are no-ops, so tests
 * and forks without metrics run unchanged. Labels are channel, level and failure code: never a
 * person, a home or an emergency id.
 */
const meter = metrics.getMeter("aluvia.notifications");

export const sentCounter = meter.createCounter("aluvia.notifications.sent", {
  description: "Notifications a provider accepted",
});
export const retriedCounter = meter.createCounter("aluvia.notifications.retried", {
  description: "Sends that failed with a retryable error and were rescheduled",
});
export const failedCounter = meter.createCounter("aluvia.notifications.failed", {
  description: "Notifications closed without sending, by failure code",
});
// From the moment a notice was due to the moment a provider accepted it: the outbox lag
// behind the "outbox delayed over 2 min" alert.
export const delayHistogram = meter.createHistogram("aluvia.notifications.delay", {
  description: "Time from not_before to sent",
  unit: "s",
});
// Age of the oldest due notice still unsent, measured after each run. With the run counter it
// covers the case the delay histogram cannot: a worker that stopped sends nothing to measure.
export const backlogGauge = meter.createGauge("aluvia.notifications.backlog.age", {
  description: "Seconds the oldest due, unsent notification has waited",
  unit: "s",
});
export const runsCounter = meter.createCounter("aluvia.notifications.dispatch.runs", {
  description: "Dispatcher invocations",
});
