import { pgEnum } from "drizzle-orm/pg-core";

// Stored values: English, snake_case, never renamed once data exists (STYLEGUIDE, Datos).
export const emergencyStatus = pgEnum("emergency_status", ["open", "closed"]);
export const platformRole = pgEnum("platform_role", ["admin"]);
// field_volunteer updates only the homes assigned to them and never sees contacts (issue #16).
export const memberRole = pgEnum("member_role", ["volunteer", "coordinator", "field_volunteer"]);
export const damageLevel = pgEnum("damage_level", ["minor", "moderate", "severe", "uninhabitable"]);
// `official`: imported from a government survey layer (ADR 0009, admin import).
export const reportSource = pgEnum("report_source", ["neighbor", "coordinator", "social", "official"]);
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
// What a work_item_events row records. A status change, or an act that keeps the status (arriving, renewing).
export const workItemEventKind = pgEnum("work_item_event_kind", [
  "status_changed",
  "claimed",
  "renewed",
  "arrived",
  "released",
  "expired",
  "verified",
  // A coordinator undid the last status change (ADR 0018); from/to are the undone change reversed.
  "status_reverted",
]);
export const notificationChannel = pgEnum("notification_channel", ["push", "email", "sms", "whatsapp"]);
export const notificationLevel = pgEnum("notification_level", [
  "important",
  "shift_reminder",
  "normal",
  "digest",
]);
// Why a home waits for a coordinator's look (docs/investigacion/04-casos-borde.md). None blocks the report.
export const worksiteReviewFlag = pgEnum("worksite_review_flag", [
  "outside_area",
  "imprecise_location",
  "possible_duplicate",
  "person_in_danger",
]);
// "Do not enter" risks: a home with any of them cannot be claimed until a coordinator reviews it.
export const worksiteHazard = pgEnum("worksite_hazard", ["electricity", "gas", "structure"]);
// A perimeter a coordinator draws on the map: "do not enter" also blocks claiming homes inside it.
export const zoneKind = pgEnum("zone_kind", ["no_entry", "restricted", "meeting_point"]);

// Whether a donation collection point takes what people bring: everything it lists, nothing, or only part.
export const collectionPointStatus = pgEnum("collection_point_status", ["receiving", "full", "only_some"]);
// What someone sends from the feedback page ("Comentarios").
export const feedbackCategory = pgEnum("feedback_category", ["problem", "idea", "other"]);
// A photo or a short video of a home (ADR 0020).
export const mediaKind = pgEnum("media_kind", ["image", "video"]);
// `pending` while the browser uploads the original; `ready` once the server re-encoded it.
export const mediaStatus = pgEnum("media_status", ["pending", "ready"]);
