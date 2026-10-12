import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { collectionPointStatus } from "./enums";
import { e164, wgs84Point } from "./types";
import { users } from "./users";

/**
 * Donation collection points of an emergency: where people take what is missing, and whether
 * each one still receives (docs/investigacion/04-casos-borde.md, Donaciones). Public, like the
 * map: the phone is the place's own public number. Removing one stamps removed_at.
 */
export const collectionPoints = pgTable(
  "collection_points",
  {
    // Client-generated, so a retried save does not create the point twice (STYLEGUIDE, Concurrencia).
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    location: wgs84Point("location").notNull(),
    address: text("address"),
    openingHours: text("opening_hours"),
    // Keys of the emergency's supply_types. Postgres has no foreign key from an array element, so
    // the insert and update statements check them against the active catalog themselves.
    accepts: text("accepts")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Supplies the point has too much of: the public "no traigas" list (issue #14). Same catalog
    // keys and the same in-statement check as accepts.
    surplus: text("surplus")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: collectionPointStatus("status").notNull().default("receiving"),
    statusNote: text("status_note"),
    phone: text("phone"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (t) => [
    index("collection_points_location_idx").using("gist", t.location),
    index("collection_points_active_idx")
      .on(t.emergencyId, t.createdAt)
      .where(sql`${t.removedAt} IS NULL`),
    check("collection_points_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 80`),
    check("collection_points_address_check", sql`char_length(${t.address}) <= 200`),
    check("collection_points_opening_hours_check", sql`char_length(${t.openingHours}) <= 120`),
    check("collection_points_status_note_check", sql`char_length(${t.statusNote}) <= 200`),
    check("collection_points_accepts_check", sql`cardinality(${t.accepts}) <= 40`),
    check("collection_points_surplus_check", sql`cardinality(${t.surplus}) <= 40`),
    check("collection_points_phone_check", e164(t.phone)),
    check("collection_points_version_check", sql`${t.version} >= 1`),
  ],
);
