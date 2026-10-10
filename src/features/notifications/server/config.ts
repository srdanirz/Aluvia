import "server-only";

import { z } from "zod";

/**
 * What the notification endpoints need besides provider credentials (those live in
 * shared/messaging/config.ts). Read on the endpoints' first request, not at import: `next build`
 * imports every route without production secrets. A missing value fails that first request with
 * its name, and the dispatcher runs every minute, so a bad deploy shows within one.
 */
const schema = z.object({
  // Public origin for links in notices and for verifying Twilio's signature.
  APP_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/$/, "")),
  // Cloud Scheduler sends it as a bearer token on every dispatch call.
  NOTIFICATIONS_DISPATCH_TOKEN: z.string().min(32),
});

let cached: z.infer<typeof schema> | undefined;

export function getNotificationsEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid notifications environment:\n${issues}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
