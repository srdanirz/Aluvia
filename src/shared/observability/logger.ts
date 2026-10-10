import "server-only";

import { formatWithOptions, stripVTControlCharacters } from "node:util";

import { trace } from "@opentelemetry/api";

import { env } from "@/shared/env";

import { buildLogEntry, type LogFields, type LogSeverity } from "./log-entry";
import { redactText, redactValue } from "./redact";

export type { LogFields };

/**
 * Server logs: one JSON line per call on stdout, which Cloud Logging ingests as is, joined to
 * the request's trace. Messages are stable snake_case codes (`login_code_send_failed`), details
 * go in `fields` as ids and enums. An error is logged once, where it is handled (STYLEGUIDE).
 * Personal data is redacted on the way out, but never pass it in the first place.
 */
function write(severity: LogSeverity, message: string, error: unknown, fields?: LogFields) {
  const stream = severity === "ERROR" || severity === "WARNING" ? process.stderr : process.stdout;
  stream.write(`${serialize(severity, message, error, fields)}\n`);
}

// Logging runs inside error handlers, so it must never throw: a BigInt, a throwing getter or a
// Proxy in `fields` degrades to a line without them.
function serialize(severity: LogSeverity, message: string, error: unknown, fields?: LogFields) {
  try {
    const entry = buildLogEntry({
      severity,
      message,
      error,
      fields,
      spanContext: trace.getActiveSpan()?.spanContext(),
      project: env.GOOGLE_CLOUD_PROJECT,
      now: new Date(),
    });
    return JSON.stringify(entry, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
  } catch {
    return JSON.stringify({
      severity,
      message: redactText(message),
      time: new Date().toISOString(),
      logFailure: "unserializable_fields",
    });
  }
}

export function logInfo(message: string, fields?: LogFields): void {
  write("INFO", message, undefined, fields);
}

export function logWarn(message: string, fields?: LogFields): void {
  write("WARNING", message, undefined, fields);
}

export function logError(message: string, error: unknown, fields?: LogFields): void {
  write("ERROR", message, error, fields);
}

const CONSOLE_SEVERITY = {
  debug: "DEBUG",
  trace: "DEBUG",
  dir: "DEBUG",
  table: "DEBUG",
  log: "INFO",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
} as const satisfies Partial<Record<keyof Console, LogSeverity>>;

// Next.js prefixes its own lines with a status glyph (" ⨯ Error: ...").
const NEXT_PREFIX = /^\s*[⨯⚠✓○▲]\s*/u;

/**
 * Production only: routes every console call on the server (Next.js's own error lines,
 * libraries) through this logger, so nothing reaches Cloud Logging unstructured or unredacted.
 */
export function captureConsole(): void {
  for (const [method, severity] of Object.entries(CONSOLE_SEVERITY)) {
    Object.assign(console, {
      [method]: (...args: unknown[]) => {
        const error = args.find((arg): arg is Error => arg instanceof Error);
        write(severity, formatConsoleArgs(args) || "console_output", error);
      },
    });
  }
}

// Objects are redacted by key before formatting flattens them into text; an error shows as
// its name and message ("%s" placeholders included) and keeps its stack apart. A throwing
// getter or Proxy in a library's argument loses the text, never the line.
function formatConsoleArgs(args: unknown[]): string {
  try {
    const printable = args.map((arg) =>
      arg instanceof Error ? `${arg.name}: ${arg.message}` : redactValue(arg),
    );
    return stripVTControlCharacters(formatWithOptions({ colors: false }, ...printable))
      .replace(NEXT_PREFIX, "")
      .trim();
  } catch {
    return "";
  }
}
