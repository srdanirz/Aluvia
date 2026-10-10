import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { notificationChannel, notificationLevel } from "./enums";
import { users } from "./users";
import { worksites } from "./worksites";

/** Outbox (ADR 0007): inserted in the same transaction as the change; a worker delivers it at least once. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id"),
    channel: notificationChannel("channel").notNull(),
    level: notificationLevel("level").notNull(),
    payload: jsonb("payload").$type<Record<string, string>>().notNull().default({}),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One row per event, recipient and channel: this is what makes "one SMS per event" hold.
    unique("notifications_event_recipient_channel_key")
      .on(t.eventKey, t.userId, t.worksiteId, t.channel)
      .nullsNotDistinct(),
    check("notifications_one_recipient_check", sql`(${t.userId} IS NULL) <> (${t.worksiteId} IS NULL)`),
    // MATCH SIMPLE: rows addressed to a user (worksite_id null) skip this key.
    foreignKey({
      name: "notifications_worksite_fk",
      columns: [t.worksiteId, t.emergencyId],
      foreignColumns: [worksites.id, worksites.emergencyId],
    }).onDelete("cascade"),
    index("notifications_emergency_id_idx").on(t.emergencyId),
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_worksite_id_idx").on(t.worksiteId),
    index("notifications_pending_idx")
      .on(t.notBefore)
      .where(sql`${t.sentAt} IS NULL`),
  ],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  channels: notificationChannel("channels")
    .array()
    .notNull()
    .default(sql`'{push}'::notification_channel[]`),
  quietHours: boolean("quiet_hours").notNull().default(true),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").$type<{ p256dh: string; auth: string }>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
