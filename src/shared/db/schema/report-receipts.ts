import { foreignKey, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { worksites } from "./worksites";

/**
 * Which home a report ended on, keyed by the report's client-generated id. A report near an
 * official parcel attaches to it instead of creating a home with its own id, so the id alone no
 * longer makes a retry safe: the outbox's second send reads this row and answers the same home.
 * No personal data, so it outlives the emergency's purge.
 */
export const reportReceipts = pgTable(
  "report_receipts",
  {
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "report_receipts_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    // Deleting a home cascades here; without it that cascade scans the table.
    index("report_receipts_worksite_id_idx").on(t.worksiteId),
  ],
);
