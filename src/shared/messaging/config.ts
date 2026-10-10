import { z } from "zod";

/**
 * Provider credentials (ADR 0010), validated once at import. Each provider is all or nothing:
 * unset means the channel is off (a fork can run with push only), half set fails at startup with
 * the missing names. Getters return null for a channel that is off.
 */

const groups = {
  webPush: z.object({
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    // Apple rejects localhost; a real mailto: or https: contact is required.
    VAPID_SUBJECT: z.string().regex(/^(mailto:|https:\/\/)/),
  }),
  resend: z.object({
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(3),
  }),
  twilio: z.object({
    TWILIO_ACCOUNT_SID: z.string().regex(/^AC[0-9a-f]{32}$/),
    TWILIO_AUTH_TOKEN: z.string().min(1),
    TWILIO_FROM: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  }),
  whatsapp: z.object({
    WHATSAPP_ACCESS_TOKEN: z.string().min(1),
    WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/),
  }),
};

function parseGroup<S extends z.ZodObject>(name: string, schema: S): z.infer<S> | null {
  const keys = Object.keys(schema.shape);
  if (keys.every((key) => !process.env[key])) return null;
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Incomplete ${name} configuration:\n${issues}\nSee .env.example.`);
}

const config = {
  webPush: parseGroup("Web Push", groups.webPush),
  resend: parseGroup("Resend", groups.resend),
  twilio: parseGroup("Twilio", groups.twilio),
  whatsapp: parseGroup("WhatsApp", groups.whatsapp),
};

export type WebPushConfig = z.infer<typeof groups.webPush>;
export type ResendConfig = z.infer<typeof groups.resend>;
export type TwilioConfig = z.infer<typeof groups.twilio>;
export type WhatsAppConfig = z.infer<typeof groups.whatsapp>;

export const getWebPushConfig = () => config.webPush;
export const getResendConfig = () => config.resend;
export const getTwilioConfig = () => config.twilio;
export const getWhatsAppConfig = () => config.whatsapp;
