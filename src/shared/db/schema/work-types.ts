import { boolean, check, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { catalogKey, type LocalizedText } from "./types";

/** An emergency's own work catalog, copied from its disaster template. Deactivated, never deleted. */
export const workTypes = pgTable(
  "work_types",
  {
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.emergencyId, t.key] }), check("work_types_key_check", catalogKey(t.key))],
);
