import "server-only";

import { notFound } from "next/navigation";

import { getCurrentUser, type SessionUser } from "@/shared/auth";
import { requireUser } from "@/shared/auth/require-user";
import { db } from "@/shared/db/client";

import { findInvitation, type InvitationView } from "./invitations";
import { joinReturnPath } from "../schemas";

import { canManageMembers } from "./policy";
import {
  type EmergencyRef,
  findEmergencyBySlug,
  findMembership,
  listActiveInvitations,
  listElevatedMembers,
  listFieldVolunteersForWorksite,
  listPendingMemberRequests,
  type Membership,
} from "./queries";

// Each view's data is loaded here in one place and in parallel (DESIGN.md, Carga); pages only render it.

export type JoinView = {
  emergency: EmergencyRef;
  user: SessionUser | null;
  membership: Membership | null;
  /** Where to go once joined: the home that sent the person here, or the map. */
  returnTo: string;
};

export async function loadJoinView(slug: string, next?: unknown): Promise<JoinView> {
  const [emergency, user] = await Promise.all([findEmergencyBySlug(db, slug), getCurrentUser()]);
  if (!emergency) notFound();
  const membership = user ? await findMembership(db, { emergencyId: emergency.id, userId: user.id }) : null;
  return { emergency, user, membership, returnTo: joinReturnPath(emergency.slug, next) };
}

export type InvitationPageView = { invitation: InvitationView; user: SessionUser | null };

export async function loadInvitationView(token: string): Promise<InvitationPageView> {
  const user = await getCurrentUser();
  const invitation = await findInvitation(db, { token, userId: user?.id ?? null });
  if (!invitation) notFound();
  return { invitation, user };
}

/** The admin's members screen. Anyone else gets a 404, so the screen does not reveal itself. */
export async function loadMembersAdminView(
  slug: string,
  cursors: { pending?: string; members?: string; invitations?: string },
) {
  const user = await requireUser(`/admin/emergencies/${slug}/members`);
  const [emergency, isAdmin] = await Promise.all([
    findEmergencyBySlug(db, slug),
    canManageMembers(db, user.id),
  ]);
  if (!emergency || !isAdmin) notFound();
  const [pending, members, invitations] = await Promise.all([
    listPendingMemberRequests(db, { emergencyId: emergency.id, after: cursors.pending }),
    listElevatedMembers(db, { emergencyId: emergency.id, after: cursors.members }),
    listActiveInvitations(db, { emergencyId: emergency.id, after: cursors.invitations }),
  ]);
  return { emergency, pending, members, invitations, cursors };
}

/** A home's field volunteers, for platform admins; null for everyone else (nothing renders). */
export async function loadWorksiteAssignmentsView({
  emergencyId,
  worksiteId,
}: {
  emergencyId: string;
  worksiteId: string;
}) {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return null;
  const volunteers = await listFieldVolunteersForWorksite(db, { emergencyId, worksiteId });
  return { volunteers };
}
