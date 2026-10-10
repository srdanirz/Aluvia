import "server-only";

import { meter } from "@/shared/observability/metrics";

// Labels are enums only (ADR 0008): the category and the outcome, never the text.
export const feedbackCounter = meter.createCounter("aluvia.feedback.submissions", {
  unit: "{submission}",
  description: "Feedback submissions by category and outcome (sent, invalid, rate_limited).",
});
