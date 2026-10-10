"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";

import { requireUser } from "@/shared/auth";
import { trackServerEvent } from "@/shared/analytics/server";
import { db } from "@/shared/db/client";
import { redirect } from "@/shared/i18n/navigation";

import {
  approvalTargetSchema,
  assignmentSchema,
  elevatedRoleSchema,
  invitationContextSchema,
  invitationInputSchema,
  type InvitationActionState,
  invitationTargetSchema,
  type MemberActionState,
  memberTargetSchema,
} from "../schemas";
import { assignWorksite, unassignWorksite } from "./assignments";
import { acceptInvitation, createInvitation, revokeInvitation } from "./invitations";
import {
  approveMemberRole,
  joinEmergency,
  rejectMemberRole,
  requestMemberRole,
  revokeMemberRole,
} from "./membership";
import { findEmergencyBySlug } from "./queries";

/** Joins as a volunteer and opens the emergency. */
export async function joinEmergencyAction(slug: string): Promise<MemberActionState> {
  const user = await requireUser(`/emergencies/${slug}/join`);
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return { ok: false, code: "emergency_not_found" };
  const result = await joinEmergency(db, { userId: user.id, emergencyId: emergency.id });
  if (!result.ok) return result;
  trackServerEvent("emergency_joined", { emergencyId: emergency.id }, { distinctId: user.id });
  // The join page shows the membership; it links on to the emergency once that page exists.
  refresh();
  return { ok: true };
}

export async function requestMemberRoleAction(
  slug: string,
  _state: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  const user = await requireUser(`/emergencies/${slug}/join`);
  const role = elevatedRoleSchema.safeParse(formData.get("role"));
  if (!role.success) return { ok: false, code: "invalid_input" };
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return { ok: false, code: "emergency_not_found" };
  const result = await requestMemberRole(db, { userId: user.id, emergencyId: emergency.id, role: role.data });
  if (result.ok) {
    trackServerEvent(
      "member_role_requested",
      { emergencyId: emergency.id, role: role.data },
      { distinctId: user.id },
    );
    refresh();
  }
  return result;
}

export async function acceptInvitationAction(token: string): Promise<MemberActionState> {
  const user = await requireUser(`/invitations/${token}`);
  const result = await acceptInvitation(db, { token, userId: user.id });
  if (!result.ok) return result;
  trackServerEvent("invitation_accepted", { emergencyId: result.emergencyId }, { distinctId: user.id });
  return redirect({ href: `/emergencies/${result.slug}/join`, locale: await getLocale() });
}

// Admin actions. Each one re-reads the session and the domain function checks the admin role
// inside its own statement, so a forged form or bound argument gains nothing.

type Target = { emergencyId: string; userId: string };

export async function approveMemberRoleAction(target: Target & { role: string }): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = approvalTargetSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await approveMemberRole(db, user.id, input.data);
  if (!result.ok) return { ok: false, code: result.code };
  trackServerEvent(
    "member_role_approved",
    { emergencyId: input.data.emergencyId, role: result.role },
    { distinctId: user.id },
  );
  refresh();
  return { ok: true };
}

async function reviewMember(
  review: typeof rejectMemberRole | typeof revokeMemberRole,
  event: "member_role_rejected" | "member_role_revoked",
  target: Target,
): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = memberTargetSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await review(db, user.id, input.data);
  if (!result.ok) return { ok: false, code: result.code };
  trackServerEvent(event, { emergencyId: input.data.emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}

export async function rejectMemberRoleAction(target: Target): Promise<MemberActionState> {
  return reviewMember(rejectMemberRole, "member_role_rejected", target);
}

export async function revokeMemberRoleAction(target: Target): Promise<MemberActionState> {
  return reviewMember(revokeMemberRole, "member_role_revoked", target);
}

export async function createInvitationAction(
  context: { emergencyId: string; worksiteId?: string },
  _state: InvitationActionState,
  formData: FormData,
): Promise<InvitationActionState> {
  const user = await requireUser("/");
  const scope = invitationContextSchema.safeParse(context);
  if (!scope.success) return { ok: false, code: "invalid_input" };
  const input = invitationInputSchema.safeParse({
    role: formData.get("role"),
    expiresInHours: formData.get("expiresInHours"),
    maxUses: formData.get("maxUses") ?? undefined,
    worksiteIds: scope.data.worksiteId ? [scope.data.worksiteId] : [],
  });
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await createInvitation(db, user.id, { ...input.data, emergencyId: scope.data.emergencyId });
  if (!result.ok) return result;
  trackServerEvent(
    "invitation_created",
    {
      emergencyId: scope.data.emergencyId,
      role: input.data.role,
      withWorksite: Boolean(scope.data.worksiteId),
    },
    { distinctId: user.id },
  );
  refresh();
  const locale = await getLocale();
  return { ok: true, path: `/${locale}/invitations/${result.token}` };
}

export async function revokeInvitationAction(target: {
  emergencyId: string;
  invitationId: string;
}): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = invitationTargetSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await revokeInvitation(db, user.id, input.data);
  if (!result.ok) return result;
  trackServerEvent("invitation_revoked", { emergencyId: input.data.emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}

type AssignmentTarget = Target & { worksiteId: string };

export async function assignWorksiteAction(target: AssignmentTarget): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = assignmentSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await assignWorksite(db, user.id, input.data);
  if (!result.ok) return result;
  trackServerEvent("worksite_assigned", { emergencyId: input.data.emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}

export async function unassignWorksiteAction(target: AssignmentTarget): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = assignmentSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await unassignWorksite(db, user.id, input.data);
  if (!result.ok) return result;
  trackServerEvent("worksite_unassigned", { emergencyId: input.data.emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}
