import { TWILIO_WEBHOOK_PATH } from "@/features/notifications/channels/registry";
import { getNotificationsEnv } from "@/features/notifications/server/config";
import { markNotificationUndelivered } from "@/features/notifications/server/delivery-status";
import { isOptOutReply, optOutFromSms } from "@/features/notifications/server/opt-out";
import { db } from "@/shared/db/client";
import { getTwilioConfig } from "@/shared/messaging/config";
import { verifyTwilioSignature } from "@/shared/messaging/twilio";

// Twilio expects TwiML back; an empty Response sends no reply SMS, which would cost money.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
// Statuses Twilio reports when an SMS it accepted never reached the phone.
const UNDELIVERED = new Set(["undelivered", "failed"]);

/**
 * Twilio's webhook (ADR 0007, 0010): delivery status of our SMS, and incoming SMS, where BAJA
 * turns SMS off for that phone everywhere.
 */
export async function POST(request: Request) {
  const config = getTwilioConfig();
  if (!config) return Response.json({ code: "channel_unavailable" }, { status: 404 });

  const entries = [...new URLSearchParams(await request.text())];
  // Behind the load balancer request.url is internal; Twilio signed the public URL.
  const isSigned = verifyTwilioSignature(
    {
      url: `${getNotificationsEnv().APP_URL}${TWILIO_WEBHOOK_PATH}`,
      params: entries,
      signature: request.headers.get("x-twilio-signature") ?? "",
    },
    config,
  );
  if (!isSigned) return Response.json({ code: "invalid_signature" }, { status: 403 });

  const params = Object.fromEntries(entries);
  if (params.MessageStatus !== undefined) {
    if (params.MessageSid && UNDELIVERED.has(params.MessageStatus)) {
      await markNotificationUndelivered(db, {
        channel: "sms",
        providerMessageId: params.MessageSid,
        code: `sms_${params.MessageStatus}`,
        now: new Date(),
      });
    }
    return new Response(null, { status: 204 });
  }

  if (params.From && params.Body !== undefined && isOptOutReply(params.Body)) {
    await optOutFromSms(db, [params.From]);
  }
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}
