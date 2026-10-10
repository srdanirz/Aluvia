import { sql } from "drizzle-orm";
import {
  bigserial,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { emergencyMembers } from "./emergency-members";
import { workItemEventKind, workItemStatus } from "./enums";
import { users } from "./users";
import { workTypes } from "./work-types";
import { worksites } from "./worksites";

/** One piece of work at a home. Claiming is a conditional UPDATE on claimed_by (STYLEGUIDE, Concurrencia). */
export const workItems = pgTable(
  "work_items",
  {
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id").notNull(),
    workTypeKey: text("work_type_key").notNull(),
    status: workItemStatus("status").notNull().default("open_unclaimed"),
    claimedBy: uuid("claimed_by").references(() => users.id, { onDelete: "set null" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    // A "Voy para allá" reservation lapses here unless the volunteer arrives or renews it (issue #12);
    // null once they arrive. Only open work has one.
    claimExpiresAt: timestamp("claim_expires_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite keys: a work item cannot point at another emergency's home or catalog.
    foreignKey({
      name: "work_items_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "work_items_work_type_fk",
      columns: [t.emergencyId, t.workTypeKey],
      foreignColumns: [workTypes.emergencyId, workTypes.key],
      // NO ACTION and DEFERRABLE INITIALLY DEFERRED (migration 0003, drizzle cannot say it):
      // a used type still cannot be deleted, but deleting the emergency cascades in any order.
    }),
    // Only a member of the emergency can claim its work, so purging an emergency's members
    // (ADR 0005) reaches every claimant. NO ACTION: the purge clears claimed_by first.
    foreignKey({
      name: "work_items_claimant_fk",
      columns: [t.emergencyId, t.claimedBy],
      foreignColumns: [emergencyMembers.emergencyId, emergencyMembers.userId],
    }),
    unique("work_items_id_emergency_id_key").on(t.id, t.emergencyId),
    // One direction only: deleting a user sets claimed_by to null and must not be blocked by an
    // open_claimed row; the claim action is what keeps open_claimed paired with a claimant.
    check("work_items_unclaimed_check", sql`${t.status} <> 'open_unclaimed' OR ${t.claimedBy} IS NULL`),
    check("work_items_verified_check", sql`${t.verifiedBy} IS NULL OR ${t.verifiedAt} IS NOT NULL`),
    check(
      "work_items_claim_expires_check",
      // Not tied to claimed_by: deleting a user nulls it (SET NULL) and must not be blocked here.
      sql`${t.claimExpiresAt} IS NULL OR ${t.status} IN ('open_claimed', 'open_partially_done', 'open_needs_follow_up')`,
    ),
    index("work_items_emergency_id_status_idx").on(t.emergencyId, t.status),
    index("work_items_worksite_id_idx").on(t.worksiteId),
    index("work_items_claimed_by_idx").on(t.claimedBy),
    // The expiry sweeper reads only live reservations, oldest first.
    index("work_items_claim_expires_at_idx")
      .on(t.claimExpiresAt)
      .where(sql`${t.claimExpiresAt} IS NOT NULL`),
  ],
);

/** Append-only history of status changes. Never updated. */
export const workItemEvents = pgTable(
  "work_item_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    workItemId: uuid("work_item_id").notNull(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    kind: workItemEventKind("kind").notNull().default("status_changed"),
    fromStatus: workItemStatus("from_status"),
    toStatus: workItemStatus("to_status").notNull(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "work_item_events_work_item_fk",
      columns: [t.workItemId, t.emergencyId],
      foreignColumns: [workItems.id, workItems.emergencyId],
    }).onDelete("cascade"),
    index("work_item_events_work_item_id_idx").on(t.workItemId),
  ],
);
