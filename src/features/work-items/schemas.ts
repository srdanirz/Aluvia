import { z } from "zod";

/** Statuses a person can mark from the field or the coordinator view. Claiming has its own action. */
export const MARKABLE_STATUSES = [
  "open_partially_done",
  "open_needs_follow_up",
  "closed_done",
  "closed_done_by_others",
  "closed_no_help_wanted",
  "closed_duplicate",
] as const;
export type MarkableStatus = (typeof MARKABLE_STATUSES)[number];

/** Only a coordinator decides a home is a duplicate; the rest is what a volunteer sees on site. */
export const COORDINATOR_ONLY_STATUSES: readonly MarkableStatus[] = ["closed_duplicate"];

const workItemRef = z.strictObject({ emergencyId: z.uuid(), workItemId: z.uuid() });

export const claimWorkItemSchema = workItemRef;
export const workItemClaimSchema = workItemRef;
export const markWorkItemStatusSchema = workItemRef.extend({
  status: z.enum(MARKABLE_STATUSES),
  // Optimistic lock (STYLEGUIDE, Concurrencia): the version the person was looking at.
  version: z.int().nonnegative(),
});
export const verifyWorkItemSchema = workItemRef.extend({ version: z.int().nonnegative() });
export const revertWorkItemStatusSchema = verifyWorkItemSchema;

export type ClaimFailure = "not_found" | "not_member" | "not_open" | "hazard_unreviewed" | "already_claimed";
/** Renew, arrive and release only work on the caller's own live claim. */
export type OwnClaimFailure = "claim_lost" | "emergency_closed";
export type MarkStatusFailure = "not_found" | "emergency_closed" | "forbidden" | "not_open" | "stale_version";

/** Server answers carry a code, never a sentence; the client translates it (STYLEGUIDE, Robustez). */
export type Result<Code extends string, Data = null> = { ok: true; data: Data } | { ok: false; code: Code };

/** The help list's URL: `near=lat,lng` (rounded on the phone) and the page cursor. Bad values are ignored. */
export const helpQuerySchema = z.object({
  near: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
    .transform((value) => {
      const [lat, lng] = value.split(",").map(Number);
      return { lat: lat!, lng: lng! };
    })
    .refine(({ lat, lng }) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
    .optional()
    .catch(undefined),
  cursor: z.string().max(200).optional().catch(undefined),
});
