import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { users } from "./users";

/**
 * A group that helps in one emergency (a junta de vecinos, a church, an NGO) with its own
 * coordinators (ADR 0019). It grants nothing by itself: its coordinators are emergency_members
 * with role 'coordinator' and this organization_id, so they hold exactly a coordinator's access.
 * Name and public contact are the group's public face, shown on the homes its people claimed.
 */
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicContact: text("public_contact"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target of the composite keys from members and invitations: never another emergency's group.
    unique("organizations_id_emergency_id_key").on(t.id, t.emergencyId),
    // Two admins creating the same group at once get one row; case and spacing do not split it.
    uniqueIndex("organizations_emergency_id_name_key").on(t.emergencyId, sql`lower(btrim(${t.name}))`),
    index("organizations_emergency_id_created_at_idx").on(t.emergencyId, t.createdAt),
    check("organizations_name_check", sql`char_length(btrim(${t.name})) BETWEEN 1 AND 120`),
    check(
      "organizations_public_contact_check",
      sql`${t.publicContact} IS NULL OR char_length(btrim(${t.publicContact})) BETWEEN 1 AND 200`,
    ),
  ],
);
