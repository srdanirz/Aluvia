import { TraceFlags } from "@opentelemetry/api";
import { describe, expect, it } from "vitest";

import { buildLogEntry } from "./log-entry";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const SPAN = {
  traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
  spanId: "00f067aa0ba902b7",
  traceFlags: TraceFlags.SAMPLED,
};

describe("buildLogEntry", () => {
  it("joins the line to its trace in Cloud Logging's format", () => {
    expect(
      buildLogEntry({
        severity: "INFO",
        message: "worksite_created",
        spanContext: SPAN,
        project: "aluvia-prod",
        now: NOW,
      }),
    ).toEqual({
      severity: "INFO",
      message: "worksite_created",
      time: "2026-10-10T12:00:00.000Z",
      "logging.googleapis.com/trace": "projects/aluvia-prod/traces/4bf92f3577b34da6a3ce929d0e0e4736",
      "logging.googleapis.com/spanId": "00f067aa0ba902b7",
      "logging.googleapis.com/trace_sampled": true,
    });
  });

  it("keeps the bare trace id without a project, and no trace outside a request", () => {
    const withSpan = buildLogEntry({ severity: "INFO", message: "x", spanContext: SPAN, now: NOW });
    expect(withSpan["logging.googleapis.com/trace"]).toBe(SPAN.traceId);
    const withoutSpan = buildLogEntry({ severity: "INFO", message: "x", now: NOW });
    expect(withoutSpan).not.toHaveProperty("logging.googleapis.com/trace");
  });

  it("redacts personal data in the message, fields, error and stack", () => {
    const error = Object.assign(new Error("no se pudo llamar al +56 9 1234 5678"), { digest: "123abc" });
    const entry = buildLogEntry({
      severity: "ERROR",
      message: "sms_failed for vecina@example.cl",
      error,
      fields: { worksiteId: "w-1", phone: "+56 9 1234 5678", detail: "calle Uno 1" },
      now: NOW,
    });

    expect(entry).toMatchObject({
      severity: "ERROR",
      message: "sms_failed for [email]",
      worksiteId: "w-1",
      phone: "[redacted]",
      detail: "[address]",
      error: { name: "Error", message: "no se pudo llamar al [phone]", digest: "123abc" },
    });
    expect(entry.stack_trace).toMatch(/^Error: no se pudo llamar al \[phone\]\n/);
    expect(JSON.stringify(entry)).not.toContain("1234 5678");
  });

  it("keeps reserved keys over caller fields", () => {
    const entry = buildLogEntry({
      severity: "WARNING",
      message: "real",
      fields: { severity: "DEBUG", message: "fake" },
      now: NOW,
    });
    expect(entry).toMatchObject({ severity: "WARNING", message: "real" });
  });

  it("wraps a thrown non-error", () => {
    const entry = buildLogEntry({ severity: "ERROR", message: "x", error: "boom", now: NOW });
    expect(entry.error).toEqual({ name: "Error", message: "boom" });
  });
});
