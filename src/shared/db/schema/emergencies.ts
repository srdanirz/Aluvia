import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { disasterTypes } from "./disaster-types";
import { emergencyStatus } from "./enums";
import { type LocalizedText, localeTag, multiPolygon } from "./types";

/** One disaster in one place. Everything else hangs from it (ADR 0005, 0009). */
export const emergencies = pgTable(
  "emergencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    disasterTypeKey: text("disaster_type_key")
      .notNull()
      .references(() => disasterTypes.key, { onDelete: "restrict" }),
    name: jsonb("name").$type<LocalizedText>().notNull(),
    defaultLocale: text("default_locale").notNull(),
    timeZone: text("time_zone").notNull(),
    comunas: text("comunas")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    area: multiPolygon("area"),
    status: emergencyStatus("status").notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    personalDataDeleteAfter: timestamp("personal_data_delete_after", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Optimistic lock for admin edits (area, closing).
    version: integer("version").notNull().default(1),
  },
  (t) => [
    index("emergencies_area_idx").using("gist", t.area),
    // Admin list, newest first, paged by (created_at, id).
    index("emergencies_created_at_id_idx").on(t.createdAt.desc(), t.id.desc()),
    check("emergencies_default_locale_check", localeTag(t.defaultLocale)),
    // The slug is the emergency's URL segment (ADR 0009).
    check("emergencies_slug_check", sql`${t.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(${t.slug}) <= 60`),
    // Readers fall back to the default locale, so its name must exist.
    check(
      "emergencies_name_check",
      sql`jsonb_typeof(${t.name}) = 'object' AND ${t.name} ? ${t.defaultLocale}`,
    ),
    check("emergencies_closed_check", sql`(${t.status} = 'closed') = (${t.closedAt} IS NOT NULL)`),
    check("emergencies_area_check", sql`${t.area} IS NULL OR ST_IsValid(${t.area})`),
  ],
);

/** Per-emergency settings the admin edits: message caps and notice parameters (ADR 0007, 0009). */
export const emergencySettings = pgTable(
  "emergency_settings",
  {
    emergencyId: uuid("emergency_id")
      .primaryKey()
      .references(() => emergencies.id, { onDelete: "cascade" }),
    smsDailyCap: integer("sms_daily_cap").notNull().default(0),
    whatsappDailyCap: integer("whatsapp_daily_cap").notNull().default(0),
    neighborReserve: integer("neighbor_reserve").notNull().default(0),
    officialContact: text("official_contact"),
    officialSurveyName: text("official_survey_name"),
    // Numbers shown before anything else when someone is in danger (131, 132, 133 in Chile).
    // Configuration of the emergency, never written in code (ADR 0009).
    emergencyNumbers: jsonb("emergency_numbers")
      .$type<{ label: LocalizedText; phone: string }[]>()
      .notNull()
      .default([]),
    // Optimistic lock: two admins editing the caps never overwrite each other silently.
    version: integer("version").notNull().default(1),
  },
  (t) => [
    check(
      "emergency_settings_caps_check",
      sql`${t.smsDailyCap} >= 0 AND ${t.whatsappDailyCap} >= 0 AND ${t.neighborReserve} >= 0`,
    ),
  ],
);
