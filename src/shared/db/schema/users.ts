import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { platformRole } from "./enums";
import { e164, localeTag } from "./types";

/** A person across emergencies. What they do in each one lives in emergency_members. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Language for notifications (ADR 0007); null falls back to the emergency's default.
    locale: text("locale"),
    platformRole: platformRole("platform_role"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive, so "Ana@x.cl" and "ana@x.cl" are one person.
    uniqueIndex("users_email_idx").on(sql`lower(${t.email})`),
    check("users_phone_check", e164(t.phone)),
    check("users_locale_check", localeTag(t.locale)),
  ],
);
