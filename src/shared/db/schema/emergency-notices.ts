import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import type { LocalizedText } from "./types";
import { users } from "./users";

/**
 * The official notice pinned over an emergency's map and report ("the dam did not break"), so a
 * rumor meets an answer where people look (docs/investigacion/04-casos-borde.md). Only admins
 * write it. Replacing one withdraws the old row, so the table is also its history (ADR 0015).
 */
export const emergencyNotices = pgTable(
  "emergency_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    message: jsonb("message").$type<LocalizedText>().notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [
    // One notice in force per emergency; the database settles two admins publishing at once.
    uniqueIndex("emergency_notices_active_idx")
      .on(t.emergencyId)
      .where(sql`${t.withdrawnAt} IS NULL`),
    index("emergency_notices_emergency_id_idx").on(t.emergencyId),
    check(
      "emergency_notices_message_check",
      sql`jsonb_typeof(${t.message}) = 'object' AND ${t.message} <> '{}'::jsonb`,
    ),
  ],
);
