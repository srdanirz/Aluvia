import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { damageLevel, notificationChannel, reportSource, worksiteHazard, worksiteReviewFlag } from "./enums";
import { users } from "./users";
import { e164, localeTag, wgs84Point } from "./types";

/** An affected home. No contact data here: it lives in worksite_contacts so a public query cannot reach it. */
export const worksites = pgTable(
  "worksites",
  {
    // Client-generated, so a retried report does not create a second home (ADR 0005).
    id: uuid("id").primaryKey(),
    emergencyId: uuid("emergency_id")
      .notNull()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    // Null until someone places the pin: a report with only a written address (no GPS, map down;
    // ADR 0006) or a batch draft. The public map never shows a home without a point.
    location: wgs84Point("location"),
    damageLevel: damageLevel("damage_level"),
    hasVulnerablePeople: boolean("has_vulnerable_people").notNull().default(false),
    officialSurveyDone: boolean("official_survey_done").notNull().default(false),
    source: reportSource("source").notNull(),
    // Since when the home has open work and none of it claimed; null otherwise. Recomputed in the
    // same transaction as every work_items write, so the abandonment sort is one index scan.
    unclaimedSince: timestamp("unclaimed_since", { withTimezone: true }),
    // Computed by the database when the home is written (outside the area, another home within
    // 15 m, someone in danger); a coordinator clears each one. Never shown to the public.
    reviewFlags: worksiteReviewFlag("review_flags")
      .array()
      .notNull()
      .default(sql`'{}'`),
    hazards: worksiteHazard("hazards")
      .array()
      .notNull()
      .default(sql`'{}'`),
    // Claiming is blocked while hazards is not empty and nobody reviewed them.
    hazardsReviewedAt: timestamp("hazards_reviewed_at", { withTimezone: true }),
    hazardsReviewedBy: uuid("hazards_reviewed_by").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("worksites_location_idx").using("gist", t.location),
    // Distances in meters (duplicate check) go through geography; on geometry 4326 they are degrees.
    index("worksites_location_geography_idx").using("gist", sql`(${t.location}::geography)`),
    // The map asks for one emergency's homes in a bbox; leading with emergency_id keeps that one
    // index scan when several emergencies share a region (needs btree_gist, migration 0006).
    index("worksites_emergency_id_location_idx").using("gist", t.emergencyId, t.location),
    index("worksites_emergency_id_unclaimed_since_idx")
      .on(t.emergencyId, t.unclaimedSince)
      .where(sql`${t.unclaimedSince} IS NOT NULL`),
    // The coordinators' review queue: homes without a pin, with a review flag or with hazards
    // nobody reviewed. Same predicate as listWorksitesToReview, so the queue is an index scan.
    index("worksites_emergency_id_review_idx")
      .on(t.emergencyId, t.createdAt, t.id)
      .where(
        sql`${t.location} IS NULL OR cardinality(${t.reviewFlags}) > 0 OR (cardinality(${t.hazards}) > 0 AND ${t.hazardsReviewedAt} IS NULL)`,
      ),
    check(
      "worksites_hazards_reviewed_check",
      sql`${t.hazardsReviewedBy} IS NULL OR ${t.hazardsReviewedAt} IS NOT NULL`,
    ),
    // Target of the composite keys that keep a child row inside its home's emergency.
    unique("worksites_id_emergency_id_key").on(t.id, t.emergencyId),
  ],
);

/** Contact and consent of a home. Only coordinators read it, and every read is logged in contact_views. */
export const worksiteContacts = pgTable(
  "worksite_contacts",
  {
    worksiteId: uuid("worksite_id")
      .primaryKey()
      .references(() => worksites.id, { onDelete: "cascade" }),
    name: text("name"),
    phone: text("phone"),
    addressText: text("address_text"),
    notes: text("notes"),
    // Language the neighbor reported in; their notices go out in it (ADR 0007).
    locale: text("locale"),
    notifyChannel: notificationChannel("notify_channel"),
    notifyConsentAt: timestamp("notify_consent_at", { withTimezone: true }),
  },
  (t) => [
    check("worksite_contacts_phone_check", e164(t.phone)),
    // A BAJA reply finds the consents behind a phone (optOutFromSms).
    index("worksite_contacts_phone_idx")
      .on(t.phone)
      .where(sql`${t.notifyChannel} IS NOT NULL`),
    check("worksite_contacts_locale_check", localeTag(t.locale)),
    // A neighbor has no app, so consent is to SMS or WhatsApp, recorded with its time and a phone to reach.
    check(
      "worksite_contacts_consent_check",
      sql`(${t.notifyChannel} IS NULL AND ${t.notifyConsentAt} IS NULL) OR (${t.notifyChannel} IN ('sms', 'whatsapp') AND ${t.notifyConsentAt} IS NOT NULL AND ${t.phone} IS NOT NULL)`,
    ),
  ],
);
