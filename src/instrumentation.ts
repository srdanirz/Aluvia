import type { Instrumentation } from "next";

// Node only: the app has no edge routes, and the OpenTelemetry SDK does not run on edge.
// Imports are dynamic so the edge build never pulls them in.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startServerObservability } = await import("@/shared/observability/server");
  await startServerObservability();
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportRequestError } = await import("@/shared/observability/server");
  await reportRequestError(...args);
};
