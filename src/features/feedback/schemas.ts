import { z } from "zod";

export const FEEDBACK_CATEGORIES = ["problem", "idea", "other"] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

// Same limits as the table's CHECK constraints (src/shared/db/schema/feedback.ts).
export const MAX_FEEDBACK_MESSAGE = 1000;
export const MAX_FEEDBACK_CONTACT = 200;

export const feedbackFormSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES),
  message: z.string().trim().min(1, "required").max(MAX_FEEDBACK_MESSAGE, "too_long"),
  // Optional: an empty field is no contact.
  contact: z
    .string()
    .trim()
    .max(MAX_FEEDBACK_CONTACT, "too_long")
    .transform((value) => value || null),
});

export type FeedbackInput = z.infer<typeof feedbackFormSchema>;

/** The form's state: nothing yet, sent, or the field and code that stopped it. */
export type FeedbackState = null | { ok: true } | { ok: false; code: string; field?: "message" | "contact" };
