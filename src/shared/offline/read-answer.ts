/** `response` is the server's JSON answer to a sent entry, or null when it had none. */
export type DeliveryResult =
  { status: "sent"; response: unknown } | { status: "queued" } | { status: "rejected"; code: string };

// 408 and 429 are "try later", like a 5xx; every other 4xx is a definitive answer.
const RETRYABLE_STATUS = new Set([408, 429]);

/** What a 2xx, a retryable status or a definitive 4xx means for an entry. */
export async function readAnswer(response: Response): Promise<DeliveryResult> {
  if (response.ok) {
    // The write is done whatever the body says; an unreadable one only loses the answer.
    const json: unknown = await response.json().catch(() => null);
    return { status: "sent", response: json };
  }
  if (response.status >= 500 || RETRYABLE_STATUS.has(response.status)) return { status: "queued" };
  const code = await response
    .json()
    .then((json: { code?: unknown }) => (typeof json.code === "string" ? json.code : "unknown"))
    .catch(() => "unknown");
  return { status: "rejected", code };
}
