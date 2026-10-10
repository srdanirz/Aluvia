import { and, eq, sql } from "drizzle-orm";

import { pushSubscriptions } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

import { type PushSubscriptionInput, pushSubscriptionSchema } from "../schemas";

/**
 * Stores a browser's push subscription for a person. The endpoint is unique: the same browser
 * signing in as someone else moves to them, so a shared phone never notifies the previous user.
 * The caller has already authenticated `userId`.
 */
export async function savePushSubscription(db: Executor, userId: string, input: PushSubscriptionInput) {
  const subscription = pushSubscriptionSchema.parse(input);
  await db
    .insert(pushSubscriptions)
    .values({ userId, endpoint: subscription.endpoint, keys: subscription.keys })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId, keys: subscription.keys, createdAt: sql`now()` },
    });
}

/** Removes one browser's subscription, only if it belongs to `userId`. */
export async function deletePushSubscription(db: Executor, userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}
