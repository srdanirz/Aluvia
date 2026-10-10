import "server-only";

import { meter } from "@/shared/observability/metrics";

// Labels are enums only: no ids, no zones finer than the emergency (ADR 0008, cardinality).
export const reportsCounter = meter.createCounter("aluvia.worksites.reports", {
  unit: "{report}",
  description: "Home reports by source and outcome (created, retry, rejected, rate_limited).",
});

export const extractDuration = meter.createHistogram("aluvia.worksites.extract.duration", {
  unit: "s",
  description: "Time Claude takes to turn a pasted post into drafts.",
});
