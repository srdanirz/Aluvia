import { pgEnum } from "drizzle-orm/pg-core";

// Stored values: English, snake_case, never renamed once data exists (STYLEGUIDE, Datos).
export const emergencyStatus = pgEnum("emergency_status", ["open", "closed"]);
export const platformRole = pgEnum("platform_role", ["admin"]);
export const memberRole = pgEnum("member_role", ["volunteer", "coordinator"]);
export const damageLevel = pgEnum("damage_level", ["minor", "moderate", "severe", "uninhabitable"]);
export const reportSource = pgEnum("report_source", ["neighbor", "coordinator", "social"]);
export const workItemStatus = pgEnum("work_item_status", [
  "open_unclaimed",
  "open_claimed",
  "open_partially_done",
  "open_needs_follow_up",
  "closed_done",
  "closed_done_by_others",
  "closed_no_help_wanted",
  "closed_duplicate",
]);
export const notificationChannel = pgEnum("notification_channel", ["push", "email", "sms", "whatsapp"]);
export const notificationLevel = pgEnum("notification_level", [
  "important",
  "shift_reminder",
  "normal",
  "digest",
]);
