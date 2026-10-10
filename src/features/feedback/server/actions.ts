"use server";

import { headers } from "next/headers";

import { slugSchema } from "@/features/map/schemas";
import { trackServerEvent } from "@/shared/analytics/server";
import { db } from "@/shared/db/client";
import { env } from "@/shared/env";
import { clientIpKey, hitRateLimit } from "@/shared/rate-limit";

import { feedbackFormSchema, type FeedbackState } from "../schemas";
import { createFeedback } from "./feedback";
import { feedbackCounter } from "./metrics";

// Enough for someone with several things to say; a script filling the table hits it fast.
const FEEDBACK_PER_HOUR = 5;

/**
 * Sends the feedback form. Public, no account (zero friction); the per-IP limit is the guard.
 * The message and the contact are never logged nor sent to analytics.
 */
export async function sendFeedbackAction(
  context: { emergencySlug: string | null },
  _state: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const parsed = feedbackFormSchema.safeParse({
    category: formData.get("category"),
    message: formData.get("message") ?? "",
    contact: formData.get("contact") ?? "",
  });
  if (!parsed.success) {
    feedbackCounter.add(1, { outcome: "invalid" });
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      code: issue?.message === "too_long" ? "too_long" : "invalid_input",
      field: field === "message" || field === "contact" ? field : undefined,
    };
  }

  const ipKey = clientIpKey(await headers(), {
    secret: env.RATE_LIMIT_SECRET,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  const allowed = await hitRateLimit(db, {
    key: `feedback:${ipKey}`,
    limit: FEEDBACK_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!allowed) {
    feedbackCounter.add(1, { outcome: "rate_limited" });
    return { ok: false, code: "rate_limited" };
  }

  const slug = slugSchema.safeParse(context.emergencySlug);
  const emergencySlug = slug.success ? slug.data : null;
  await createFeedback(db, { ...parsed.data, emergencySlug });
  feedbackCounter.add(1, { outcome: "sent", category: parsed.data.category });
  trackServerEvent("feedback_sent", {
    category: parsed.data.category,
    withReply: parsed.data.contact !== null,
    fromEmergency: emergencySlug !== null,
  });
  return { ok: true };
}
