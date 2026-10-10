import "server-only";

import { sql } from "drizzle-orm";
import type { memberRole } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

export type MemberRole = (typeof memberRole.enumValues)[number];

/**
 * What one signed-in person may do in one emergency. `role` is the granted role (a pending
 * request grants nothing) and null for someone who has not joined. A platform admin is not a
 * coordinator by being admin (ADR 0009): to see contacts they join as one, like anybody else.
 */
export type EmergencyAccess = {
  userId: string;
  emergencyId: string;
  isPlatformAdmin: boolean;
  role: MemberRole | null;
};

export async function findEmergencyAccess(
  db: Executor,
  userId: string,
  emergencyId: string,
): Promise<EmergencyAccess> {
  const rows = await db.execute<{ platform_role: string | null; role: MemberRole | null }>(sql`
    SELECT u.platform_role, m.role
    FROM users u
    LEFT JOIN emergency_members m ON m.user_id = u.id AND m.emergency_id = ${emergencyId}
    WHERE u.id = ${userId}`);
  const row = rows[0];
  return { userId, emergencyId, isPlatformAdmin: row?.platform_role === "admin", role: row?.role ?? null };
}

export const isMember = (access: EmergencyAccess) => access.role !== null;
export const isCoordinator = (access: EmergencyAccess) => access.role === "coordinator";
// Membership is also enforced by the work_items_claimant_fk key; this is the friendly check.
export const canClaimWorkItems = isMember;
// SECURITY.md: only approved coordinators read contacts, and every read goes to contact_views.
export const canViewContacts = isCoordinator;

/**
 * Whether the person may change a home's state: any coordinator of its emergency, or a field
 * volunteer assigned to it. Also false when the home belongs to another emergency. One query.
 */
export async function canUpdateWorksite(
  db: Executor,
  access: EmergencyAccess,
  worksiteId: string,
): Promise<boolean> {
  if (access.role === "coordinator") {
    const rows = await db.execute(sql`
      SELECT 1 FROM worksites WHERE id = ${worksiteId} AND emergency_id = ${access.emergencyId}`);
    return rows.length > 0;
  }
  if (access.role === "field_volunteer") {
    const rows = await db.execute(sql`
      SELECT 1 FROM worksite_assignments
      WHERE worksite_id = ${worksiteId} AND user_id = ${access.userId} AND emergency_id = ${access.emergencyId}`);
    return rows.length > 0;
  }
  return false;
}
