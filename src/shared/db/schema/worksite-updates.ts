import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { supplyTypes } from "./supply-types";
import { users } from "./users";
import { worksites } from "./worksites";

/**
 * A field snapshot of a home: how many people are working there now and which supplies are
 * missing. Append-only and always the full current state, never a delta, so a lost message does
 * not skew the count. The current state is the newest row that was not cancelled.
 */
export const worksiteUpdates = pgTable(
  "worksite_updates",
  {
    // Client-generated, so a retried update does not land twice.
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id").notNull(),
    peoplePresent: integer("people_present").notNull(),
    // Null for an anonymous report; anonymized when the emergency's personal data is purged.
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    // A wrong update is cancelled, not edited or deleted, so the history stays readable.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "worksite_updates_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    unique("worksite_updates_id_emergency_id_key").on(t.id, t.emergencyId),
    // The upper bound rejects a typo (5000 instead of 50) before it skews the coverage map.
    check("worksite_updates_people_present_check", sql`${t.peoplePresent} BETWEEN 0 AND 500`),
    check("worksite_updates_cancelled_check", sql`${t.cancelledBy} IS NULL OR ${t.cancelledAt} IS NOT NULL`),
    // Serves "newest live update per home" (DISTINCT ON worksite_id ORDER BY created_at DESC).
    index("worksite_updates_worksite_id_created_at_idx")
      .on(t.worksiteId, t.createdAt.desc())
      .where(sql`${t.cancelledAt} IS NULL`),
  ],
);

/** Supplies an update reports as missing. A supply absent from the update is not missing. */
export const worksiteUpdateSupplies = pgTable(
  "worksite_update_supplies",
  {
    updateId: uuid("update_id").notNull(),
    emergencyId: uuid("emergency_id").notNull(),
    supplyTypeKey: text("supply_type_key").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.updateId, t.supplyTypeKey] }),
    foreignKey({
      name: "worksite_update_supplies_update_fk",
      columns: [t.updateId, t.emergencyId],
      foreignColumns: [worksiteUpdates.id, worksiteUpdates.emergencyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "worksite_update_supplies_supply_type_fk",
      columns: [t.emergencyId, t.supplyTypeKey],
      foreignColumns: [supplyTypes.emergencyId, supplyTypes.key],
      // NO ACTION and DEFERRABLE INITIALLY DEFERRED (migration 0003, drizzle cannot say it):
      // a used type still cannot be deleted, but deleting the emergency cascades in any order.
    }),
  ],
);
