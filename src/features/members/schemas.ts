import { z } from "zod";

import { safePathSchema } from "@/shared/lib/safe-path";

// How long a link stays valid. A day covers "send it now by WhatsApp"; a week, a recurring crew.
export const INVITATION_HOURS = [24, 72, 168] as const;
// A link that grants a role is for a known few, so its uses are capped (invitations_elevated_check).
const MAX_ELEVATED_USES = 50;
const MAX_WORKSITES_PER_INVITATION = 50;

export const elevatedRoleSchema = z.enum(["coordinator", "field_volunteer"]);
export const memberRoleSchema = z.enum(["volunteer", "coordinator", "field_volunteer"]);

export const invitationInputSchema = z
  .object({
    role: memberRoleSchema,
    expiresInHours: z.coerce
      .number()
      .refine((hours) => (INVITATION_HOURS as readonly number[]).includes(hours)),
    // Empty means unlimited, which only a volunteer link may be.
    maxUses: z.preprocess(
      (value) => (value === "" || value === undefined ? null : value),
      z.coerce.number().int().min(1).max(MAX_ELEVATED_USES).nullable(),
    ),
    worksiteIds: z.array(z.uuid()).max(MAX_WORKSITES_PER_INVITATION).default([]),
    // Accepting makes the person a coordinator of this organization (ADR 0019).
    organizationId: z.uuid().nullable().default(null),
  })
  .refine((input) => input.role === "volunteer" || input.maxUses !== null, { path: ["maxUses"] })
  .refine((input) => input.role === "field_volunteer" || input.worksiteIds.length === 0, {
    path: ["worksiteIds"],
  })
  .refine((input) => input.organizationId === null || input.role === "coordinator", {
    path: ["organizationId"],
  });

export type InvitationInput = z.infer<typeof invitationInputSchema>;

export const memberTargetSchema = z.object({ emergencyId: z.uuid(), userId: z.uuid() });
export const approvalTargetSchema = memberTargetSchema.extend({ role: elevatedRoleSchema });
export const invitationContextSchema = z.object({
  emergencyId: z.uuid(),
  worksiteId: z.uuid().optional(),
  organizationId: z.uuid().optional(),
});
export const assignmentSchema = memberTargetSchema.extend({ worksiteId: z.uuid() });
export const invitationTargetSchema = z.object({ emergencyId: z.uuid(), invitationId: z.uuid() });

/** Every code a member action can answer with; each one has its `errors.<code>` message. */
export type MemberErrorCode =
  | "invalid_input"
  | "emergency_not_found"
  | "emergency_closed"
  | "already_has_role"
  | "request_pending"
  | "forbidden"
  | "cannot_approve_self"
  | "no_pending_request"
  | "no_role_to_revoke"
  | "invitation_not_found"
  | "expired"
  | "revoked"
  | "used_up"
  | "own_invitation"
  | "not_field_volunteer"
  | "worksite_not_found"
  | "assignment_not_found"
  | "organization_not_found";

/** What a member form shows after submitting: nothing yet, done, or an error to translate. */
export type MemberActionState = { ok: true } | { ok: false; code: MemberErrorCode } | null;

export type InvitationActionState = { ok: true; path: string } | { ok: false; code: MemberErrorCode } | null;

/**
 * Where joining an emergency returns to: a path inside that emergency (the home someone was
 * looking at), or its map. Anything else, including another emergency, falls back to the map.
 */
export function joinReturnPath(slug: string, next: unknown): string {
  const home = `/emergencies/${slug}`;
  // Resolved first, so dot segments cannot climb out of the emergency once a browser follows it.
  const url = new URL(safePathSchema.parse(next), "http://aluvia.invalid");
  const path = `${url.pathname}${url.search}`;
  return path === home || path.startsWith(`${home}/`) ? path : home;
}

/** The join page for an emergency that comes back to `returnTo` once the person has joined. */
export function joinPath(slug: string, returnTo: string): string {
  return `/emergencies/${slug}/join?${new URLSearchParams({ next: returnTo })}`;
}
