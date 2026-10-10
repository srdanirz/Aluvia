import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { memberRole } from "./enums";
import { users } from "./users";

/**
 * What a person does in one emergency. A coordinator here is not one anywhere else.
 * `role` is always the granted role; a request to be a coordinator or field volunteer waits in
 * `requested_role` until someone else approves it, so a pending request never grants anything.
 */
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
    requestedRole: memberRole("requested_role"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.emergencyId, t.userId] }),
    index("emergency_members_user_id_idx").on(t.userId),
    // Nobody approves themselves (ADR 0009).
    check("emergency_members_approver_check", sql`${t.approvedBy} <> ${t.userId}`),
    // approved_at, not approved_by: the approver's account may be deleted later (SET NULL).
    check("emergency_members_elevated_check", sql`${t.role} = 'volunteer' OR ${t.approvedAt} IS NOT NULL`),
    check(
      "emergency_members_requested_role_check",
      sql`${t.requestedRole} IS NULL OR (${t.requestedRole} <> 'volunteer' AND ${t.requestedRole} <> ${t.role})`,
    ),
    // The admin's list of coordinators and field volunteers, newest approval first.
    index("emergency_members_elevated_idx")
      .on(t.emergencyId, t.approvedAt)
      .where(sql`${t.role} <> 'volunteer'`),
    // The admin's queue of pending requests.
    index("emergency_members_pending_idx")
      .on(t.emergencyId, t.createdAt)
      .where(sql`${t.requestedRole} IS NOT NULL`),
  ],
);
