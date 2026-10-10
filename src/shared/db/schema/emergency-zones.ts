import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { zoneKind } from "./enums";
import { multiPolygon } from "./types";
import { users } from "./users";

/**
 * Perimeters coordinators draw over an emergency's map: no entry, restricted access, meeting
 * points. Removing one stamps removed_at; the row stays for the history of what was closed when.
 */
export const emergencyZones = pgTable(
  "emergency_zones",
  {
    // Client-generated, so a retried save does not draw the zone twice (STYLEGUIDE, Concurrencia).
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    kind: zoneKind("kind").notNull(),
    note: text("note"),
    area: multiPolygon("area").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("emergency_zones_area_idx").using("gist", t.area),
    index("emergency_zones_active_idx")
      .on(t.emergencyId)
      .where(sql`${t.removedAt} IS NULL`),
    check("emergency_zones_note_check", sql`char_length(${t.note}) <= 200`),
  ],
);
