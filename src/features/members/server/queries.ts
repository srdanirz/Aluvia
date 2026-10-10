import "server-only";

import { sql } from "drizzle-orm";

import type { MemberRole } from "@/shared/auth";
import type { LocalizedText } from "@/shared/db/schema/types";
import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, PAGE_SIZE, pageOf } from "@/shared/lib/pagination";

import type { ElevatedRole } from "./membership";

export type EmergencyRef = {
  id: string;
  slug: string;
  name: LocalizedText;
  defaultLocale: string;
  timeZone: string;
  status: "open" | "closed";
};

export async function findEmergencyBySlug(db: Executor, slug: string): Promise<EmergencyRef | null> {
  const [row] = await db.execute<{
    id: string;
    slug: string;
    name: LocalizedText;
    default_locale: string;
    time_zone: string;
    status: EmergencyRef["status"];
  }>(sql`SELECT id, slug, name, default_locale, time_zone, status FROM emergencies WHERE slug = ${slug}`);
  return row
    ? {
        id: row.id,
        slug: row.slug,
        name: row.name,
        defaultLocale: row.default_locale,
        timeZone: row.time_zone,
        status: row.status,
      }
    : null;
}

export type Membership = { role: MemberRole; requestedRole: ElevatedRole | null };

export async function findMembership(
  db: Executor,
  { emergencyId, userId }: { emergencyId: string; userId: string },
): Promise<Membership | null> {
  const [row] = await db.execute<{ role: MemberRole; requested_role: ElevatedRole | null }>(sql`
    SELECT role, requested_role FROM emergency_members
    WHERE emergency_id = ${emergencyId} AND user_id = ${userId}`);
  return row ? { role: row.role, requestedRole: row.requested_role } : null;
}

export type PendingRequest = {
  userId: string;
  name: string | null;
  // Shown to platform admins only, so they can reach the person before approving (SECURITY.md).
  phone: string | null;
  requestedRole: ElevatedRole;
  createdAt: Date;
};

/** Requests waiting for an admin, oldest first. Platform admins only: the caller checks. */
export async function listPendingMemberRequests(
  db: Executor,
  { emergencyId, after }: { emergencyId: string; after?: string },
): Promise<Page<PendingRequest>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db.execute<{
    user_id: string;
    name: string | null;
    phone: string | null;
    requested_role: ElevatedRole;
    created_at: string;
    cursor_at: string;
  }>(sql`
    SELECT m.user_id, u.name, u.phone, m.requested_role, m.created_at, m.created_at::text AS cursor_at
    FROM emergency_members m JOIN users u ON u.id = m.user_id
    WHERE m.emergency_id = ${emergencyId} AND m.requested_role IS NOT NULL
      ${cursor ? sql`AND (m.created_at, m.user_id) > (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : sql``}
    ORDER BY m.created_at, m.user_id
    LIMIT ${PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.user_id));
  const items = page.items.map((row) => ({
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    requestedRole: row.requested_role,
    createdAt: new Date(row.created_at),
  }));
  return { items, nextCursor: page.nextCursor };
}

export type ElevatedMember = {
  userId: string;
  name: string | null;
  role: ElevatedRole;
  approvedAt: Date;
  assignedWorksites: number;
};

/** Coordinators and field volunteers, newest approval first, with how many homes each holds. */
export async function listElevatedMembers(
  db: Executor,
  { emergencyId, after }: { emergencyId: string; after?: string },
): Promise<Page<ElevatedMember>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db.execute<{
    user_id: string;
    name: string | null;
    role: ElevatedRole;
    approved_at: string;
    cursor_at: string;
    assigned_worksites: number;
  }>(sql`
    SELECT m.user_id, u.name, m.role, m.approved_at, m.approved_at::text AS cursor_at,
      (SELECT count(*)::int FROM worksite_assignments a
       WHERE a.emergency_id = m.emergency_id AND a.user_id = m.user_id) AS assigned_worksites
    FROM emergency_members m JOIN users u ON u.id = m.user_id
    WHERE m.emergency_id = ${emergencyId} AND m.role <> 'volunteer'
      ${cursor ? sql`AND (m.approved_at, m.user_id) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : sql``}
    ORDER BY m.approved_at DESC, m.user_id DESC
    LIMIT ${PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.user_id));
  const items = page.items.map((row) => ({
    userId: row.user_id,
    name: row.name,
    role: row.role,
    approvedAt: new Date(row.approved_at),
    assignedWorksites: row.assigned_worksites,
  }));
  return { items, nextCursor: page.nextCursor };
}

export type InvitationSummary = {
  id: string;
  role: MemberRole;
  createdAt: Date;
  expiresAt: Date;
  maxUses: number | null;
  uses: number;
  worksites: number;
};

/** Links still usable (not revoked, not expired, not used up), newest first. */
export async function listActiveInvitations(
  db: Executor,
  { emergencyId, after }: { emergencyId: string; after?: string },
): Promise<Page<InvitationSummary>> {
  const cursor = decodeTimeCursor(after);
  const rows = await db.execute<{
    id: string;
    role: MemberRole;
    created_at: string;
    expires_at: string;
    max_uses: number | null;
    uses: number;
    worksites: number;
    cursor_at: string;
  }>(sql`
    SELECT i.id, i.role, i.created_at, i.created_at::text AS cursor_at, i.expires_at, i.max_uses, i.uses,
      (SELECT count(*)::int FROM invitation_worksites w WHERE w.invitation_id = i.id) AS worksites
    FROM invitations i
    WHERE i.emergency_id = ${emergencyId} AND i.revoked_at IS NULL AND i.expires_at > now()
      AND (i.max_uses IS NULL OR i.uses < i.max_uses)
      ${cursor ? sql`AND (i.created_at, i.id) < (${cursor[0]}::timestamptz, ${cursor[1]}::uuid)` : sql``}
    ORDER BY i.created_at DESC, i.id DESC
    LIMIT ${PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.id));
  const items = page.items.map((row) => ({
    id: row.id,
    role: row.role,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
    maxUses: row.max_uses,
    uses: row.uses,
    worksites: row.worksites,
  }));
  return { items, nextCursor: page.nextCursor };
}

export type FieldVolunteerOption = { userId: string; name: string | null; isAssigned: boolean };

/**
 * Field volunteers of an emergency for one home's assignment panel: the ones already assigned
 * first, then the rest by name. Bounded: a home is assigned among a crew, not a crowd.
 */
export async function listFieldVolunteersForWorksite(
  db: Executor,
  { emergencyId, worksiteId }: { emergencyId: string; worksiteId: string },
): Promise<FieldVolunteerOption[]> {
  const rows = await db.execute<{ user_id: string; name: string | null; is_assigned: boolean }>(sql`
    SELECT m.user_id, u.name, (a.user_id IS NOT NULL) AS is_assigned
    FROM emergency_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN worksite_assignments a
      ON a.emergency_id = m.emergency_id AND a.user_id = m.user_id AND a.worksite_id = ${worksiteId}
    WHERE m.emergency_id = ${emergencyId} AND m.role = 'field_volunteer'
    ORDER BY (a.user_id IS NULL), u.name NULLS LAST, m.user_id
    LIMIT ${PAGE_SIZE}`);
  return rows.map((row) => ({ userId: row.user_id, name: row.name, isAssigned: row.is_assigned }));
}
