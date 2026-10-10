import { foreignKey, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import type { LocalizedText } from "./types";

/** Registry of disaster kinds (aluvión, incendio...). Adding one is a row in a reviewed seed (ADR 0009). */
export const disasterTypes = pgTable("disaster_types", {
  key: text("key").primaryKey(),
  name: jsonb("name").$type<LocalizedText>().notNull(),
});

/** Work catalog template of a disaster kind; copied into work_types when an emergency is created. */
export const disasterTypeWorkTypes = pgTable(
  "disaster_type_work_types",
  {
    disasterTypeKey: text("disaster_type_key").notNull(),
    key: text("key").notNull(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.disasterTypeKey, t.key] }),
    foreignKey({
      name: "disaster_type_work_types_disaster_type_fk",
      columns: [t.disasterTypeKey],
      foreignColumns: [disasterTypes.key],
    }).onDelete("cascade"),
  ],
);
