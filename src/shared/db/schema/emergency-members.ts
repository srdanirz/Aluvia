import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { memberRole } from "./enums";
import { organizations } from "./organizations";
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
    // The organization this coordinator answers for (ADR 0019); null for everyone else.
    organizationId: uuid("organization_id"),
  },
  (t) => [
    primaryKey({ columns: [t.emergencyId, t.userId] }),
    foreignKey({
      name: "emergency_members_organization_fk",
      columns: [t.organizationId, t.emergencyId],
      foreignColumns: [organizations.id, organizations.emergencyId],
      // NO ACTION and DEFERRABLE INITIALLY DEFERRED (migration 0021, drizzle cannot say it): a
      // group with coordinators cannot be deleted, but deleting the emergency cascades in any order.
    }),
    index("emergency_members_organization_id_idx")
      .on(t.organizationId)
      .where(sql`${t.organizationId} IS NOT NULL`),
    // Only a coordinator answers for an organization; revoking the role clears it.
    check(
      "emergency_members_organization_check",
      sql`${t.organizationId} IS NULL OR ${t.role} = 'coordinator'`,
    ),
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
