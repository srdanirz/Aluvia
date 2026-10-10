import { getWhatsAppConfig, type WhatsAppConfig } from "./config";
import { NETWORK_FAILURE, PROVIDER_TIMEOUT_MS, type SendResult, failureFromStatus } from "./types";

/**
 * Template messages through Meta's WhatsApp Cloud API (ADR 0010). Outside a 24 h conversation
 * only templates approved by Meta go out, so this sends templates and nothing else.
 */

const GRAPH_API = "https://graph.facebook.com/v26.0";

// Graph API error codes that mean this number or template will never take the message.
const PERMANENT_ERRORS: Record<number, string> = {
  131026: "invalid_address",
  132000: "template_mismatch",
  132001: "template_missing",
};

export type WhatsAppTemplateMessage = {
  // E.164 phone.
  to: string;
  template: string;
  // Template language as approved in Meta: "es", "en".
  language: string;
  bodyParams: string[];
  // Authentication templates carry the code again in their copy-code button (URL button, index 0).
  copyCodeButton?: string;
};

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage,
  config: WhatsAppConfig | null = getWhatsAppConfig(),
): Promise<SendResult> {
  if (!config) return { ok: false, code: "channel_unavailable", retryable: false };
  const components: unknown[] = [
    { type: "body", parameters: message.bodyParams.map((text) => ({ type: "text", text })) },
  ];
  if (message.copyCodeButton !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: message.copyCodeButton }],
    });
  }

  let response: Response;
  try {
    response = await fetch(`${GRAPH_API}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: message.to.replace(/^\+/, ""),
        type: "template",
        template: { name: message.template, language: { code: message.language }, components },
      }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    return NETWORK_FAILURE;
  }
  if (response.ok) {
    // Accepted is not delivered: a blocked number fails later, through the status webhook (#20).
    const sent = (await response.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
    return { ok: true, providerMessageId: sent?.messages?.[0]?.id };
  }
  const error = (await response.json().catch(() => null)) as { error?: { code?: number } } | null;
  const code = error?.error?.code === undefined ? undefined : PERMANENT_ERRORS[error.error.code];
  if (code) return { ok: false, code, retryable: false };
  return failureFromStatus(response.status);
}
