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

// Predicates take null (no session) so callers pass getEmergencyAccess's result as is.
export const isMember = (access: EmergencyAccess | null) => Boolean(access?.role);
export const isCoordinator = (access: EmergencyAccess | null) => access?.role === "coordinator";
// Membership is also enforced by the work_items_claimant_fk key; this is the friendly check.
export const canClaimWorkItems = isMember;
// SECURITY.md: only approved coordinators read contacts, and every read goes to contact_views.
export const canViewContacts = isCoordinator;
