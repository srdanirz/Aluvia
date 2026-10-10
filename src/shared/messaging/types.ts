/**
 * Outcome of one call to a messaging provider. `code` is ours, snake_case, never the provider's
 * prose; `retryable` says whether the same message may succeed later (ADR 0007).
 */
export type SendResult =
  { ok: true; providerMessageId?: string } | { ok: false; code: string; retryable: boolean };

// Providers answer within a second or two; past this the request is retried, not awaited.
export const PROVIDER_TIMEOUT_MS = 10_000;

/** Maps a provider's HTTP status to our result: 429 and 5xx may pass later, other 4xx will not. */
export function failureFromStatus(status: number): SendResult {
  if (status === 429) return { ok: false, code: "rate_limited", retryable: true };
  if (status >= 500) return { ok: false, code: "provider_unavailable", retryable: true };
  return { ok: false, code: "provider_rejected", retryable: false };
}

/** A fetch that never reached the provider (timeout, DNS, reset) may succeed on retry. */
export const NETWORK_FAILURE: SendResult = { ok: false, code: "network_error", retryable: true };
