import { createHmac, timingSafeEqual } from "node:crypto";

import { getTwilioConfig, type TwilioConfig } from "./config";
import { SMS_SEGMENT_LENGTH, gsm7Length, toGsm7 } from "./gsm";
import { NETWORK_FAILURE, PROVIDER_TIMEOUT_MS, type SendResult, failureFromStatus } from "./types";

/**
 * SMS through Twilio's REST API (ADR 0010). The body is transliterated to GSM-7 and must fit one
 * segment; a longer one is rejected here rather than split, since Chilean long codes refuse it.
 * The caller decides whether the person consented: this module only sends.
 */

// Twilio error codes that mean this number will never take the message.
const PERMANENT_ERRORS: Record<number, string> = {
  21211: "invalid_address",
  21614: "invalid_address",
  21610: "recipient_opted_out",
};

export async function sendSms(
  // statusCallback: where Twilio reports a delivery failure that happens after it accepted the SMS.
  message: { to: string; body: string; statusCallback?: string },
  config: TwilioConfig | null = getTwilioConfig(),
): Promise<SendResult> {
  if (!config) return { ok: false, code: "channel_unavailable", retryable: false };
  const body = toGsm7(message.body);
  if (gsm7Length(body) > SMS_SEGMENT_LENGTH) return { ok: false, code: "message_too_long", retryable: false };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${config.TWILIO_ACCOUNT_SID}/Messages.json`;
  const credentials = Buffer.from(`${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`).toString(
    "base64",
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        To: message.to,
        From: config.TWILIO_FROM,
        Body: body,
        ...(message.statusCallback ? { StatusCallback: message.statusCallback } : {}),
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return NETWORK_FAILURE;
  }
  if (response.ok) {
    const sent = (await response.json().catch(() => null)) as { sid?: string } | null;
    return { ok: true, providerMessageId: sent?.sid };
  }
  if (response.status === 400) {
    const error = (await response.json().catch(() => null)) as { code?: number } | null;
    const code = error?.code === undefined ? undefined : PERMANENT_ERRORS[error.code];
    if (code) return { ok: false, code, retryable: false };
  }
  return failureFromStatus(response.status);
}

/**
 * Checks `X-Twilio-Signature`: base64 HMAC-SHA1, keyed with the auth token, of the public URL
 * Twilio called followed by every POST param as key and value, sorted by key. A repeated key
 * contributes each of its values, so params are entries, not a record.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function verifyTwilioSignature(
  input: { url: string; params: [string, string][]; signature: string },
  config: TwilioConfig,
): boolean {
  const data = [...input.params]
    // By key, then by value for a repeated key, as Twilio's own validator does.
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .reduce((acc, [key, value]) => acc + key + value, input.url);
  const expected = createHmac("sha1", config.TWILIO_AUTH_TOKEN).update(data).digest();
  const given = Buffer.from(input.signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
