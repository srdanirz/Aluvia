import { getResendConfig, type ResendConfig } from "./config";
import { NETWORK_FAILURE, PROVIDER_TIMEOUT_MS, type SendResult, failureFromStatus } from "./types";

/**
 * Plain-text transactional email through Resend's REST API (ADR 0010). `idempotencyKey` makes a
 * retry of the same message a no-op on Resend's side (24 h window), so a timeout does not send twice.
 */
export async function sendEmail(
  message: { to: string; subject: string; text: string; idempotencyKey: string },
  config: ResendConfig | null = getResendConfig(),
): Promise<SendResult> {
  if (!config) return { ok: false, code: "channel_unavailable", retryable: false };
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return NETWORK_FAILURE;
  }
  return response.ok ? { ok: true } : failureFromStatus(response.status);
}
