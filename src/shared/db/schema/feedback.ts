import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { feedbackCategory } from "./enums";

/**
 * What people tell the maintainers about Aluvia itself, sent from the feedback page with no
 * account. Only platform admins read it. `contact` is personal data: the emergency purge nulls it
 * on rows linked to that emergency (src/shared/db/purge.ts). Neither the message nor the contact
 * is ever logged or sent to analytics.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The emergency whose pages it was sent from, if any; feedback outlives a deleted emergency.
    emergencyId: uuid("emergency_id").references(() => emergencies.id, { onDelete: "set null" }),
    category: feedbackCategory("category").notNull(),
    message: text("message").notNull(),
    contact: text("contact"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The admin list pages by (created_at, id), newest first.
    index("feedback_created_at_id_idx").on(t.createdAt.desc(), t.id.desc()),
    index("feedback_emergency_id_idx").on(t.emergencyId),
    check("feedback_message_check", sql`char_length(${t.message}) BETWEEN 1 AND 1000`),
    check("feedback_contact_check", sql`char_length(${t.contact}) <= 200`),
  ],
);
