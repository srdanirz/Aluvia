import { z } from "zod";

/**
 * The only product events Aluvia sends (ADR 0008). An event that is not here cannot be sent:
 * `track` and `trackServerEvent` only accept these names and validate the properties.
 *
 * Adding one: a line below, named `entity_verb_past` in snake_case, with a strict schema of
 * camelCase properties. Ids, slugs, enums, counts and booleans only: never a name, phone,
 * address, free text or exact coordinates (a test rejects personal-looking property names).
 */
export const EVENTS = {
  worksite_reported: z.strictObject({
    source: z.enum(["neighbor", "coordinator", "social"]),
    hasLocation: z.boolean(),
    workTypeCount: z.number().int().nonnegative(),
    // Queued: saved on the phone without signal, sent when it comes back.
    delivery: z.enum(["sent", "queued"]),
  }),
  // A server error code (`rate_limited`, `invalid_location`), never the message.
  worksite_report_rejected: z.strictObject({ code: z.string().regex(/^[a-z][a-z_]*$/) }),
  worksite_update_recorded: z.strictObject({
    supplyCount: z.number().int().nonnegative(),
    delivery: z.enum(["sent", "queued"]),
  }),
  worksite_drafts_extracted: z.strictObject({ count: z.number().int().nonnegative() }),
  worksite_placed: z.strictObject({ hadNearby: z.boolean() }),
  work_item_claimed: z.strictObject({
    emergencyId: z.uuid(),
    workTypeKey: z.string().min(1).max(64),
  }),
  // Admin (ADR 0009, 0015). Keys and counts only; names and notice text stay in the database.
  disaster_type_created: z.strictObject({
    disasterTypeKey: z.string().min(1).max(64),
    workTypeCount: z.number().int().nonnegative(),
    supplyTypeCount: z.number().int().nonnegative(),
  }),
  disaster_type_updated: z.strictObject({
    disasterTypeKey: z.string().min(1).max(64),
    workTypeCount: z.number().int().nonnegative(),
    supplyTypeCount: z.number().int().nonnegative(),
  }),
  emergency_created: z.strictObject({
    emergencyId: z.uuid(),
    disasterTypeKey: z.string().min(1).max(64),
    hasArea: z.boolean(),
  }),
  emergency_settings_updated: z.strictObject({ emergencyId: z.uuid() }),
  emergency_area_updated: z.strictObject({ emergencyId: z.uuid() }),
  emergency_notice_published: z.strictObject({ emergencyId: z.uuid(), replaced: z.boolean() }),
  emergency_notice_withdrawn: z.strictObject({ emergencyId: z.uuid() }),
  emergency_closed: z.strictObject({ emergencyId: z.uuid() }),
};

export type EventName = keyof typeof EVENTS;
export type EventProperties<Name extends EventName> = z.input<(typeof EVENTS)[Name]>;
