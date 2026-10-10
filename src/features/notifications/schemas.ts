import { z } from "zod";

/** A browser push subscription as `PushSubscription.toJSON()` serializes it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
