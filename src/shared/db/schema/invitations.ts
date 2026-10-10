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
import { memberRole } from "./enums";
import { users } from "./users";
import { worksites } from "./worksites";

/**
 * A link an admin shares (by WhatsApp) to bring people into an emergency with a role. The admin
 * who creates it is the approver of whoever accepts it, so an admin's own link cannot promote them.
 * Only the SHA-256 of the token is stored. Accepting is a conditional UPDATE on `uses`.
 */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    role: memberRole("role").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses"),
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    unique("invitations_id_emergency_id_key").on(t.id, t.emergencyId),
    index("invitations_emergency_id_created_at_idx").on(t.emergencyId, t.createdAt),
    check("invitations_expiry_check", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "invitations_uses_check",
      sql`${t.uses} >= 0 AND (${t.maxUses} IS NULL OR (${t.maxUses} > 0 AND ${t.uses} <= ${t.maxUses}))`,
    ),
    // A link that grants more than volunteer is for a known number of people, never open-ended.
    check("invitations_elevated_check", sql`${t.role} = 'volunteer' OR ${t.maxUses} IS NOT NULL`),
  ],
);

/** Homes a field-volunteer invitation assigns on acceptance. */
export const invitationWorksites = pgTable(
  "invitation_worksites",
  {
    invitationId: uuid("invitation_id").notNull(),
    emergencyId: uuid("emergency_id").notNull(),
    worksiteId: uuid("worksite_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.worksiteId] }),
    foreignKey({
      name: "invitation_worksites_invitation_fk",
      columns: [t.invitationId, t.emergencyId],
      foreignColumns: [invitations.id, invitations.emergencyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "invitation_worksites_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    index("invitation_worksites_worksite_id_idx").on(t.worksiteId),
  ],
);
