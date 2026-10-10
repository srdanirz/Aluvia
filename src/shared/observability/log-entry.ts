import type { SpanContext } from "@opentelemetry/api";

import { redactText, redactValue } from "./redact";

export type LogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export type LogFields = Record<string, unknown>;

/**
 * Builds one Cloud Logging structured line (https://cloud.google.com/logging/docs/structured-logging).
 * Reserved keys win over caller fields, and everything the caller passes is redacted first.
 */
export function buildLogEntry(input: {
  severity: LogSeverity;
  message: string;
  error?: unknown;
  fields?: LogFields;
  spanContext?: SpanContext;
  project?: string;
  now: Date;
}): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    ...(input.fields ? (redactValue(input.fields) as LogFields) : {}),
    severity: input.severity,
    message: redactText(input.message),
    time: input.now.toISOString(),
  };

  if (input.error !== undefined) {
    const error = input.error instanceof Error ? input.error : new Error(String(input.error));
    entry.error = {
      name: error.name,
      message: redactText(error.message),
      ...("digest" in error && typeof error.digest === "string" ? { digest: error.digest } : {}),
    };
    // Error Reporting groups lines that carry `stack_trace`. The first line repeats the
    // message, so it is redacted like the message.
    if (error.stack) entry.stack_trace = redactText(error.stack);
  }

  const span = input.spanContext;
  if (span) {
    entry["logging.googleapis.com/trace"] = input.project
      ? `projects/${input.project}/traces/${span.traceId}`
      : span.traceId;
    entry["logging.googleapis.com/spanId"] = span.spanId;
    entry["logging.googleapis.com/trace_sampled"] = (span.traceFlags & 1) === 1;
  }
  return entry;
}
