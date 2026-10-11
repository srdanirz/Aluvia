import "server-only";

import { sql } from "drizzle-orm";

import type { MemberRole } from "@/shared/auth";
import { adminEvents } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

import { canManageMembers } from "./policy";
import { isPlatformAdminSql, roleRank } from "./roles";

export type ElevatedRole = Exclude<MemberRole, "volunteer">;

type EmergencyGate = "emergency_not_found" | "emergency_closed";

function emergencyGate(status: string | null): EmergencyGate | null {
  if (status === null) return "emergency_not_found";
  return status === "open" ? null : "emergency_closed";
}

/** Joins an open emergency as a volunteer. Joining twice is a no-op, not an error. */
export async function joinEmergency(
  db: Executor,
  { userId, emergencyId }: { userId: string; emergencyId: string },
): Promise<{ ok: true } | { ok: false; code: EmergencyGate }> {
  const [row] = await db.execute<{ status: string | null }>(sql`
    WITH e AS (SELECT id, status FROM emergencies WHERE id = ${emergencyId}),
    joined AS (
      INSERT INTO emergency_members (emergency_id, user_id)
      SELECT id, ${userId} FROM e WHERE status = 'open'
      ON CONFLICT (emergency_id, user_id) DO NOTHING
    )
    SELECT (SELECT status FROM e) AS status`);
  const gate = emergencyGate(row?.status ?? null);
  return gate ? { ok: false, code: gate } : { ok: true };
}

/**
 * Asks to be a coordinator or field volunteer, joining first if needed. The request grants
 * nothing until another person approves it (approveMemberRole), and it cannot be swapped while
 * pending: an admin approves exactly the role they were shown.
 */
export async function requestMemberRole(
  db: Executor,
  { userId, emergencyId, role }: { userId: string; emergencyId: string; role: ElevatedRole },
): Promise<{ ok: true } | { ok: false; code: EmergencyGate | "already_has_role" | "request_pending" }> {
  const [row] = await db.execute<{ status: string | null; requested: number; pending: boolean }>(sql`
    WITH e AS (SELECT id, status FROM emergencies WHERE id = ${emergencyId}),
    requested AS (
      INSERT INTO emergency_members (emergency_id, user_id, requested_role)
      SELECT id, ${userId}, ${role} FROM e WHERE status = 'open'
      ON CONFLICT (emergency_id, user_id) DO UPDATE SET requested_role = EXCLUDED.requested_role
      WHERE emergency_members.requested_role IS NULL
        AND ${roleRank(sql`emergency_members.role`)} < ${roleRank(sql`EXCLUDED.requested_role`)}
      RETURNING 1
    )
    SELECT (SELECT status FROM e) AS status, (SELECT count(*)::int FROM requested) AS requested,
      EXISTS (SELECT 1 FROM emergency_members WHERE emergency_id = ${emergencyId} AND user_id = ${userId}
              AND requested_role IS NOT NULL) AS pending`);
  const gate = emergencyGate(row?.status ?? null);
  if (gate) return { ok: false, code: gate };
  if (row?.requested) return { ok: true };
  return { ok: false, code: row?.pending ? "request_pending" : "already_has_role" };
}

type ReviewTarget = { emergencyId: string; userId: string };
// Approving names the role the admin saw, so a request changed in between is not granted.
type ApprovalTarget = ReviewTarget & { role: ElevatedRole };
type ReviewError = "forbidden" | "cannot_approve_self" | "no_pending_request";

/**
 * Grants a pending request. The approver is a platform admin other than the person (ADR 0009);
 * the database enforces both, and of two admins approving at once only one write lands.
 */
export async function approveMemberRole(
  db: Executor,
  actorId: string,
  { emergencyId, userId, role }: ApprovalTarget,
): Promise<{ ok: true; role: ElevatedRole } | { ok: false; code: ReviewError }> {
  if (actorId === userId) return { ok: false, code: "cannot_approve_self" };
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ role: ElevatedRole }>(sql`
      UPDATE emergency_members
      SET role = requested_role, requested_role = NULL, approved_at = now(), approved_by = ${actorId}
      WHERE emergency_id = ${emergencyId} AND user_id = ${userId} AND requested_role = ${role}
        AND ${isPlatformAdminSql(actorId)}
        AND EXISTS (SELECT 1 FROM emergencies WHERE id = ${emergencyId} AND status = 'open')
      RETURNING role`);
    if (!row) return { ok: false, code: "no_pending_request" } as const;
    await tx.insert(adminEvents).values({
      actorId,
      action: "member_role_approved",
      targetType: "emergency_member",
      targetId: userId,
      emergencyId,
      payload: { role: row.role },
    });
    return { ok: true, role: row.role } as const;
  });
}

/** Turns a pending request down. The person stays a volunteer. */
export async function rejectMemberRole(
  db: Executor,
  actorId: string,
  { emergencyId, userId }: ReviewTarget,
): Promise<{ ok: true } | { ok: false; code: Exclude<ReviewError, "cannot_approve_self"> }> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ role: string }>(sql`
      UPDATE emergency_members m SET requested_role = NULL
      FROM (SELECT requested_role AS role FROM emergency_members
            WHERE emergency_id = ${emergencyId} AND user_id = ${userId} FOR UPDATE) before
      WHERE m.emergency_id = ${emergencyId} AND m.user_id = ${userId} AND m.requested_role IS NOT NULL
        AND ${isPlatformAdminSql(actorId)}
      RETURNING before.role`);
    if (!row) return { ok: false, code: "no_pending_request" } as const;
    await tx.insert(adminEvents).values({
      actorId,
      action: "member_role_rejected",
      targetType: "emergency_member",
      targetId: userId,
      emergencyId,
      payload: { role: row.role },
    });
    return { ok: true } as const;
  });
}

/**
 * Takes a coordinator or field volunteer back to volunteer, out of their organization (ADR 0019),
 * and drops their home assignments.
 */
export async function revokeMemberRole(
  db: Executor,
  actorId: string,
  { emergencyId, userId }: ReviewTarget,
): Promise<{ ok: true } | { ok: false; code: "forbidden" | "no_role_to_revoke" }> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ role: string }>(sql`
      UPDATE emergency_members m
      SET role = 'volunteer', requested_role = NULL, approved_at = NULL, approved_by = NULL,
        organization_id = NULL
      FROM (SELECT role FROM emergency_members
            WHERE emergency_id = ${emergencyId} AND user_id = ${userId} FOR UPDATE) before
      WHERE m.emergency_id = ${emergencyId} AND m.user_id = ${userId} AND m.role <> 'volunteer'
        AND ${isPlatformAdminSql(actorId)}
      RETURNING before.role`);
    if (!row) return { ok: false, code: "no_role_to_revoke" } as const;
    await tx.execute(sql`
      DELETE FROM worksite_assignments WHERE emergency_id = ${emergencyId} AND user_id = ${userId}`);
    await tx.insert(adminEvents).values({
      actorId,
      action: "member_role_revoked",
      targetType: "emergency_member",
      targetId: userId,
      emergencyId,
      payload: { role: row.role },
    });
    return { ok: true } as const;
  });
}
