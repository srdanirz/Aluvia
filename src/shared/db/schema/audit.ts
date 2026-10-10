import { bigserial, foreignKey, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { users } from "./users";
import { worksites } from "./worksites";

/** Every time a coordinator opens a home's contact data. */
export const contactViews = pgTable(
  "contact_views",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    worksiteId: uuid("worksite_id").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "contact_views_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    index("contact_views_worksite_id_idx").on(t.worksiteId),
    index("contact_views_emergency_id_idx").on(t.emergencyId),
  ],
);

/** Append-only log of admin actions. emergency_id is null for platform-wide actions (ADR 0009). */
export const adminEvents = pgTable(
  "admin_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    emergencyId: uuid("emergency_id").references(() => emergencies.id, { onDelete: "set null" }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("admin_events_emergency_id_idx").on(t.emergencyId)],
);
