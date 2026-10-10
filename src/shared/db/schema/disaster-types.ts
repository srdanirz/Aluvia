import { sql } from "drizzle-orm";
import { check, foreignKey, integer, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { catalogKey, type LocalizedText } from "./types";

/** Registry of disaster kinds (aluvión, incendio...). Adding one is a row in a reviewed seed (ADR 0009). */
export const disasterTypes = pgTable(
  "disaster_types",
  {
    key: text("key").primaryKey(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    // Optimistic lock for admin edits of the name and its template (STYLEGUIDE, Concurrencia).
    version: integer("version").notNull().default(1),
  },
  (t) => [check("disaster_types_key_check", catalogKey(t.key))],
);

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
    check("disaster_type_work_types_key_check", catalogKey(t.key)),
    check("disaster_type_work_types_sort_order_check", sql`${t.sortOrder} >= 0`),
  ],
);

/** Supply catalog template of a disaster kind; copied into supply_types when an emergency is created. */
export const disasterTypeSupplyTypes = pgTable(
  "disaster_type_supply_types",
  {
    disasterTypeKey: text("disaster_type_key").notNull(),
    key: text("key").notNull(),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.disasterTypeKey, t.key] }),
    check("disaster_type_supply_types_key_check", catalogKey(t.key)),
    check("disaster_type_supply_types_sort_order_check", sql`${t.sortOrder} >= 0`),
    foreignKey({
      name: "disaster_type_supply_types_disaster_type_fk",
      columns: [t.disasterTypeKey],
      foreignColumns: [disasterTypes.key],
    }).onDelete("cascade"),
  ],
);
