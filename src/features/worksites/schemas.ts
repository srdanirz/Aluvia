import { z } from "zod";

import type { reportSource } from "@/shared/db/schema/enums";
import { damageLevel, worksiteHazard } from "@/shared/db/schema/enums";
import { LOCALES } from "@/shared/i18n/locales";

// Shared by the report form (client) and the route handler (server). Limits keep a hostile
// payload small; real reports sit far below them.
const MAX_WORK_TYPES = 30;
const MAX_TEXT = 500;
const MAX_NOTES = 2000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .default(null);

export const pointSchema = z.object({
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

/** E.164 as stored by worksite_contacts; the form normalizes local input before sending. */
export const e164Schema = z.string().regex(/^\+[1-9][0-9]{7,14}$/);

export const worksiteContactSchema = z
  .object({
    name: optionalText(MAX_TEXT),
    phone: e164Schema.nullable().default(null),
    addressText: optionalText(MAX_TEXT),
    notes: optionalText(MAX_NOTES),
    // Choosing a channel is the consent (ADR 0007); without a phone there is nothing to consent to.
    notifyChannel: z.enum(["sms", "whatsapp"]).nullable().default(null),
  })
  .refine((contact) => contact.notifyChannel === null || contact.phone !== null, {
    path: ["notifyChannel"],
    message: "consent_requires_phone",
  });

const workTypeKeysSchema = (min: number) =>
  z
    .array(z.string().min(1).max(64))
    .min(min)
    .max(MAX_WORK_TYPES)
    .refine((keys) => new Set(keys).size === keys.length, "duplicate_work_type");

/**
 * A GPS fix less precise than this (indoors, a phone without GPS falling back to wifi or cell
 * towers) can sit on the wrong block: the form asks for the address too and the home is flagged.
 */
export const PRECISE_LOCATION_METERS = 100;

const worksiteFields = {
  id: z.uuid(),
  locale: z.enum(LOCALES),
  location: pointSchema.nullable(),
  // What the phone said about its fix; null for a pin placed by hand.
  locationAccuracyMeters: z.number().int().min(0).max(100_000).nullable().default(null),
  damageLevel: z.enum(damageLevel.enumValues).nullable().default(null),
  hasVulnerablePeople: z.boolean().default(false),
  // Marks the home for a coordinator; the form has already shown the emergency numbers.
  isPersonInDanger: z.boolean().default(false),
  hazards: z
    .array(z.enum(worksiteHazard.enumValues))
    .default([])
    .refine((list) => new Set(list).size === list.length, "duplicate_hazard"),
  contact: worksiteContactSchema.default({
    name: null,
    phone: null,
    addressText: null,
    notes: null,
    notifyChannel: null,
  }),
};

// Without GPS or a pin, the written address is how a coordinator finds the home (ADR 0006).
const hasPlace = {
  check: (home: { location: unknown; contact: { addressText: string | null } }) =>
    home.location !== null || home.contact.addressText !== null,
  params: { path: ["contact", "addressText"], message: "location_or_address_required" },
};

/** A home as any writer hands it to createWorksites; an official survey import may carry no work. */
export const newWorksiteSchema = z
  .object({ ...worksiteFields, workTypeKeys: workTypeKeysSchema(0) })
  .refine(hasPlace.check, hasPlace.params);

/** A report from the form or the batch import: at least one need (DESIGN.md: what does it need). */
export const worksiteReportSchema = z
  .object({ ...worksiteFields, workTypeKeys: workTypeKeysSchema(1) })
  .refine(hasPlace.check, hasPlace.params);

/** Who a home report came from; decided by the server from the session, never by the body. */
export type WorksiteSource = (typeof reportSource.enumValues)[number];

export type WorksiteReportInput = z.input<typeof worksiteReportSchema>;
export type NewWorksite = z.output<typeof newWorksiteSchema>;
