import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { emergencies } from "./emergencies";
import { damageLevel, notificationChannel, reportSource } from "./enums";
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
    location: wgs84Point("location").notNull(),
    damageLevel: damageLevel("damage_level"),
    hasVulnerablePeople: boolean("has_vulnerable_people").notNull().default(false),
    officialSurveyDone: boolean("official_survey_done").notNull().default(false),
    source: reportSource("source").notNull(),
    // Since when the home has open work and none of it claimed; null otherwise. Recomputed in the
    // same transaction as every work_items write, so the abandonment sort is one index scan.
    unclaimedSince: timestamp("unclaimed_since", { withTimezone: true }),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("worksites_location_idx").using("gist", t.location),
    index("worksites_emergency_id_unclaimed_since_idx")
      .on(t.emergencyId, t.unclaimedSince)
      .where(sql`${t.unclaimedSince} IS NOT NULL`),
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
    check("worksite_contacts_locale_check", localeTag(t.locale)),
    // A neighbor has no app, so consent is to SMS or WhatsApp, recorded with its time and a phone to reach.
    check(
      "worksite_contacts_consent_check",
      sql`(${t.notifyChannel} IS NULL AND ${t.notifyConsentAt} IS NULL) OR (${t.notifyChannel} IN ('sms', 'whatsapp') AND ${t.notifyConsentAt} IS NOT NULL AND ${t.phone} IS NOT NULL)`,
    ),
  ],
);
