import { foreignKey, index, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencyMembers } from "./emergency-members";
import { users } from "./users";
import { worksites } from "./worksites";

/**
 * A home a field volunteer may update (issue #16). The member key means only a member of the
 * home's emergency can hold one, and losing the membership drops the assignments with it.
 */
export const worksiteAssignments = pgTable(
  "worksite_assignments",
  {
    emergencyId: uuid("emergency_id").notNull(),
    worksiteId: uuid("worksite_id").notNull(),
    userId: uuid("user_id").notNull(),
    assignedBy: uuid("assigned_by").references(() => users.id, { onDelete: "set null" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.worksiteId, t.userId] }),
    foreignKey({
      name: "worksite_assignments_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    foreignKey({
      name: "worksite_assignments_member_fk",
      columns: [t.emergencyId, t.userId],
      foreignColumns: [emergencyMembers.emergencyId, emergencyMembers.userId],
    }).onDelete("cascade"),
    index("worksite_assignments_emergency_id_user_id_idx").on(t.emergencyId, t.userId),
  ],
);
