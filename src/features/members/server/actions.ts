"use server";

import { getLocale } from "next-intl/server";
import { refresh } from "next/cache";

import { requireUser } from "@/shared/auth";
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

// TODO(#23): emit emergency_joined, member_role_*, invitation_* and worksite_(un)assigned once
// the analytics catalog is on main.

/** Joins as a volunteer and opens the emergency. */
export async function joinEmergencyAction(slug: string): Promise<MemberActionState> {
  const user = await requireUser(`/emergencies/${slug}/join`);
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return { ok: false, code: "emergency_not_found" };
  const result = await joinEmergency(db, { userId: user.id, emergencyId: emergency.id });
  if (!result.ok) return result;
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
  if (result.ok) refresh();
  return result;
}

export async function acceptInvitationAction(token: string): Promise<MemberActionState> {
  const user = await requireUser(`/invitations/${token}`);
  const result = await acceptInvitation(db, { token, userId: user.id });
  if (!result.ok) return result;
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
  refresh();
  return { ok: true };
}

async function reviewMember(
  review: typeof rejectMemberRole | typeof revokeMemberRole,
  target: Target,
): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = memberTargetSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await review(db, user.id, input.data);
  if (!result.ok) return { ok: false, code: result.code };
  refresh();
  return { ok: true };
}

export async function rejectMemberRoleAction(target: Target): Promise<MemberActionState> {
  return reviewMember(rejectMemberRole, target);
}

export async function revokeMemberRoleAction(target: Target): Promise<MemberActionState> {
  return reviewMember(revokeMemberRole, target);
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
  refresh();
  return { ok: true };
}

export async function unassignWorksiteAction(target: AssignmentTarget): Promise<MemberActionState> {
  const user = await requireUser("/");
  const input = assignmentSchema.safeParse(target);
  if (!input.success) return { ok: false, code: "invalid_input" };
  const result = await unassignWorksite(db, user.id, input.data);
  if (!result.ok) return result;
  refresh();
  return { ok: true };
}
