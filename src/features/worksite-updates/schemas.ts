import { z } from "zod";

// Mirrors worksite_updates_people_present_check; the stepper stops here too.
export const MAX_PEOPLE_PRESENT = 500;
const MAX_SUPPLIES = 50;

/** A field snapshot: always the full current state, never a delta (issue #15). */
export const worksiteUpdateSchema = z.object({
  id: z.uuid(),
  // The live update the form showed (null: none yet). Optional only for writes queued offline
  // before this field existed: they are accepted without the check, nothing else omits it.
  previousUpdateId: z.uuid().nullable().optional(),
  peoplePresent: z.number().int().min(0).max(MAX_PEOPLE_PRESENT),
  supplyTypeKeys: z
    .array(z.string().min(1).max(64))
    .max(MAX_SUPPLIES)
    .refine((keys) => new Set(keys).size === keys.length, "duplicate_supply_type"),
});

export type WorksiteUpdate = z.output<typeof worksiteUpdateSchema>;

/** A coordinator hides an abusive or wrong update; the home falls back to the one before it. */
export const cancelWorksiteUpdateSchema = z.strictObject({ emergencyId: z.uuid(), updateId: z.uuid() });
