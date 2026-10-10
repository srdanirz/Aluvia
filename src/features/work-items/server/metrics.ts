import "server-only";

import { meter } from "@/shared/observability/metrics";

/**
 * Work cycle metrics (ADR 0008). Labels are actions, outcomes and statuses, never a person or a
 * home. A rising `claim_lost` or `already_claimed` share means people race for the same homes;
 * expirations climbing means reservations are too long for how volunteers really move.
 */
export const workItemActions = meter.createCounter("aluvia.work_items.actions", {
  description: "Work item actions by action and outcome code (ok or the failure code)",
});

export const claimsExpired = meter.createCounter("aluvia.work_items.claims_expired", {
  description: "Reservations released by the sweeper because nobody arrived or renewed",
});
