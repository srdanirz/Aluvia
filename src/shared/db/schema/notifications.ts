import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
    // Key in the notification type catalog (features/notifications/catalog.ts); it fixes level and copy.
    type: text("type").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    worksiteId: uuid("worksite_id"),
    channel: notificationChannel("channel").notNull(),
    level: notificationLevel("level").notNull(),
    payload: jsonb("payload").$type<Record<string, string>>().notNull().default({}),
    notBefore: timestamp("not_before", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Set when the event is withdrawn while a worker holds the row: whatever that worker reports,
    // the row closes as cancelled instead of retrying or falling back (cancelPendingNotifications).
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // The provider's id for the message (Twilio SID, WhatsApp wamid), to match a delivery failure
    // it reports later by webhook.
    providerMessageId: text("provider_message_id"),
    // Terminal without sending: a permanent provider error, no consent, the daily cap, or read elsewhere.
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureCode: text("failure_code"),
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
      .where(sql`${t.sentAt} IS NULL AND ${t.failedAt} IS NULL`),
    index("notifications_provider_message_id_idx")
      .on(t.providerMessageId)
      .where(sql`${t.providerMessageId} IS NOT NULL`),
    // The coordinator's list of neighbors to call (listUndeliveredNeighborNotices).
    index("notifications_emergency_id_failed_at_idx")
      .on(t.emergencyId, t.failedAt, t.id)
      .where(sql`${t.worksiteId} IS NOT NULL AND ${t.failedAt} IS NOT NULL`),
    check("notifications_failure_check", sql`(${t.failedAt} IS NULL) = (${t.failureCode} IS NULL)`),
    check("notifications_terminal_check", sql`${t.sentAt} IS NULL OR ${t.failedAt} IS NULL`),
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

/**
 * Paid messages (SMS, WhatsApp) used per emergency, channel and local day, split so the daily cap
 * keeps a reserve for neighbors (ADR 0007). Only the dispatcher writes it, under row lock.
 */
export const notificationDailyUsage = pgTable(
  "notification_daily_usage",
  {
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    channel: notificationChannel("channel").notNull(),
    // Calendar day in the emergency's time zone, so the cap resets at local midnight.
    day: date("day").notNull(),
    userCount: integer("user_count").notNull().default(0),
    neighborCount: integer("neighbor_count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.emergencyId, t.channel, t.day] }),
    check("notification_daily_usage_counts_check", sql`${t.userCount} >= 0 AND ${t.neighborCount} >= 0`),
  ],
);

/**
 * A delivery failure a provider reported for a message id no notification carries yet: the
 * webhook can arrive before the worker records the id. The dispatcher applies these on every run
 * (applyDeliveryReports) and drops the ones a day old that never matched.
 */
export const notificationDeliveryReports = pgTable("notification_delivery_reports", {
  providerMessageId: text("provider_message_id").primaryKey(),
  channel: notificationChannel("channel").notNull(),
  code: text("code").notNull(),
  reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
});
