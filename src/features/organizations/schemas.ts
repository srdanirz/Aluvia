import { z } from "zod";

// The same bounds as the organizations_*_check constraints.
const MAX_NAME = 120;
const MAX_PUBLIC_CONTACT = 200;

export const organizationInputSchema = z.object({
  emergencyId: z.uuid(),
  name: z.string().trim().min(1).max(MAX_NAME),
  // Empty means none: the group may have no public phone or site.
  publicContact: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(MAX_PUBLIC_CONTACT).nullable().default(null),
  ),
});

export type OrganizationInput = z.infer<typeof organizationInputSchema>;

/** Every code the organization form can answer with; each one has its `errors.<code>` message. */
export type OrganizationErrorCode =
  "invalid_input" | "forbidden" | "emergency_closed" | "organization_exists";

/** A refused submit carries back what was typed, so the form never loses it. */
export type OrganizationActionState =
  | { ok: true }
  | { ok: false; code: OrganizationErrorCode; values: { name: string; publicContact: string } }
  | null;
