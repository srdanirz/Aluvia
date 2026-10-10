import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { memberRole } from "./enums";
import { users } from "./users";

/** What a person does in one emergency. A coordinator here is not one anywhere else. */
export const emergencyMembers = pgTable(
  "emergency_members",
  {
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("volunteer"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    primaryKey({ columns: [t.emergencyId, t.userId] }),
    index("emergency_members_user_id_idx").on(t.userId),
    // Nobody approves themselves (ADR 0009).
    check("emergency_members_approver_check", sql`${t.approvedBy} <> ${t.userId}`),
  ],
);
