import "server-only";

import { sql } from "drizzle-orm";

import { createToken, hashToken } from "@/shared/auth/crypto";
import { adminEvents } from "@/shared/db/schema";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import type { InvitationInput } from "../schemas";
import type { ElevatedRole } from "./membership";
import { canManageMembers } from "./policy";
import { findMembership } from "./queries";
import { isPlatformAdminSql, ROLE_RANK, roleRank } from "./roles";

/**
 * Creates a link for `emergencyId`. Returns the token once: only its hash is stored, so a lost
 * link is revoked and made again, never recovered.
 */
export async function createInvitation(
  db: Executor,
  actorId: string,
  input: InvitationInput & { emergencyId: string },
): Promise<
  { ok: true; invitationId: string; token: string } | { ok: false; code: "forbidden" | "emergency_closed" }
> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };
  const token = createToken();

  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO invitations (emergency_id, token_hash, role, created_by, expires_at, max_uses)
      SELECT id, ${hashToken(token)}, ${input.role}, ${actorId},
        now() + make_interval(hours => ${input.expiresInHours}), ${input.maxUses}
      FROM emergencies WHERE id = ${input.emergencyId} AND status = 'open' AND ${isPlatformAdminSql(actorId)}
      RETURNING id`);
    if (!row) return { ok: false, code: "emergency_closed" } as const;

    if (input.worksiteIds.length > 0) {
      // The composite key rejects a home of another emergency, rolling the invitation back too.
      await tx.execute(sql`
        INSERT INTO invitation_worksites (invitation_id, emergency_id, worksite_id)
        SELECT ${row.id}, ${input.emergencyId}, unnest(${sqlArray(input.worksiteIds, "uuid")})`);
    }
    await tx.insert(adminEvents).values({
      actorId,
      action: "invitation_created",
      targetType: "invitation",
      targetId: row.id,
      emergencyId: input.emergencyId,
      payload: { role: input.role, worksites: String(input.worksiteIds.length) },
    });
    return { ok: true, invitationId: row.id, token } as const;
  });
}

export async function revokeInvitation(
  db: Executor,
  actorId: string,
  { emergencyId, invitationId }: { emergencyId: string; invitationId: string },
): Promise<{ ok: true } | { ok: false; code: "forbidden" | "invitation_not_found" }> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      UPDATE invitations SET revoked_at = now(), revoked_by = ${actorId}
      WHERE id = ${invitationId} AND emergency_id = ${emergencyId} AND revoked_at IS NULL
        AND ${isPlatformAdminSql(actorId)}
      RETURNING id`);
    if (!row) return { ok: false, code: "invitation_not_found" } as const;
    await tx.insert(adminEvents).values({
      actorId,
      action: "invitation_revoked",
      targetType: "invitation",
      targetId: invitationId,
      emergencyId,
    });
    return { ok: true } as const;
  });
}

export type InvitationStatus =
  "valid" | "expired" | "revoked" | "used_up" | "emergency_closed" | "own_invitation";

export type InvitationView = {
  status: InvitationStatus;
  role: "volunteer" | ElevatedRole;
  emergency: { id: string; slug: string; name: Record<string, string>; defaultLocale: string };
};

/** What a link offers and whether `userId` (if any) can still accept it. Null for an unknown link. */
export async function findInvitation(
  db: Executor,
  { token, userId }: { token: string; userId: string | null },
): Promise<InvitationView | null> {
  const [row] = await db.execute<{
    status: InvitationStatus;
    role: InvitationView["role"];
    emergency_id: string;
    slug: string;
    name: Record<string, string>;
    default_locale: string;
  }>(sql`
    SELECT i.role, e.id AS emergency_id, e.slug, e.name, e.default_locale,
      CASE
        WHEN i.revoked_at IS NOT NULL THEN 'revoked'
        WHEN e.status <> 'open' THEN 'emergency_closed'
        WHEN i.expires_at <= now() THEN 'expired'
        WHEN i.max_uses IS NOT NULL AND i.uses >= i.max_uses THEN 'used_up'
        WHEN i.role <> 'volunteer' AND NOT ${isPlatformAdminSql(sql`i.created_by`)} THEN 'revoked'
        WHEN i.role <> 'volunteer' AND i.created_by = ${userId}::uuid THEN 'own_invitation'
        ELSE 'valid'
      END AS status
    FROM invitations i JOIN emergencies e ON e.id = i.emergency_id
    WHERE i.token_hash = ${hashToken(token)}`);
  if (!row) return null;
  return {
    status: row.status,
    role: row.role,
    emergency: { id: row.emergency_id, slug: row.slug, name: row.name, defaultLocale: row.default_locale },
  };
}

/**
 * Accepts a link: takes one use (a conditional UPDATE, so a single-use link admits exactly one
 * person), joins the emergency with the link's role approved by whoever created it, and assigns
 * the link's homes. Never steps down someone who already holds a higher role.
 */
export async function acceptInvitation(
  db: Executor,
  { token, userId }: { token: string; userId: string },
): Promise<
  | { ok: true; emergencyId: string; slug: string }
  | { ok: false; code: Exclude<InvitationStatus, "valid"> | "invitation_not_found" | "already_has_role" }
> {
  const result = await db.transaction(async (tx) => {
    const [invitation] = await tx.execute<{
      id: string;
      emergency_id: string;
      role: InvitationView["role"];
      created_by: string | null;
    }>(sql`
      UPDATE invitations i SET uses = uses + 1
      FROM emergencies e
      WHERE i.token_hash = ${hashToken(token)} AND e.id = i.emergency_id AND e.status = 'open'
        AND i.revoked_at IS NULL AND i.expires_at > now()
        AND (i.max_uses IS NULL OR i.uses < i.max_uses)
        AND (i.role = 'volunteer' OR i.created_by IS DISTINCT FROM ${userId})
        -- A role is granted on behalf of its creator, so the creator must still be an admin.
        AND (i.role = 'volunteer' OR ${isPlatformAdminSql(sql`i.created_by`)})
        -- Someone who already holds more than this role does not spend a use meant for another
        -- person; the same role only accepts again when the link brings homes to add.
        AND NOT EXISTS (
          SELECT 1 FROM emergency_members m
          WHERE m.emergency_id = i.emergency_id AND m.user_id = ${userId}
            AND (${roleRank(sql`m.role`)} > ${roleRank(sql`i.role`)}
              OR (${roleRank(sql`m.role`)} = ${roleRank(sql`i.role`)}
                  AND NOT EXISTS (SELECT 1 FROM invitation_worksites w WHERE w.invitation_id = i.id))))
      RETURNING i.id, i.emergency_id, i.role, i.created_by`);
    if (!invitation) return null;

    const elevated = invitation.role !== "volunteer";
    await tx.execute(sql`
      INSERT INTO emergency_members (emergency_id, user_id, role, approved_at, approved_by)
      VALUES (${invitation.emergency_id}, ${userId}, ${invitation.role},
        ${elevated ? sql`now()` : null}, ${elevated ? invitation.created_by : null})
      ON CONFLICT (emergency_id, user_id) DO UPDATE SET
        role = EXCLUDED.role, approved_at = EXCLUDED.approved_at, approved_by = EXCLUDED.approved_by,
        requested_role = CASE
          WHEN ${roleRank(sql`emergency_members.requested_role`)} <= ${roleRank(sql`EXCLUDED.role`)} THEN NULL
          ELSE emergency_members.requested_role END
      WHERE ${roleRank(sql`emergency_members.role`)} < ${roleRank(sql`EXCLUDED.role`)}`);

    if (invitation.role === "field_volunteer") {
      await tx.execute(sql`
        INSERT INTO worksite_assignments (emergency_id, worksite_id, user_id, assigned_by)
        SELECT emergency_id, worksite_id, ${userId}, ${invitation.created_by}
        FROM invitation_worksites WHERE invitation_id = ${invitation.id}
        ON CONFLICT (worksite_id, user_id) DO NOTHING`);
    }
    await tx.insert(adminEvents).values({
      actorId: userId,
      action: "invitation_accepted",
      targetType: "invitation",
      targetId: invitation.id,
      emergencyId: invitation.emergency_id,
      payload: { role: invitation.role },
    });
    return invitation.emergency_id;
  });

  // Why it failed is read after the fact, only to pick the message; the UPDATE above decided.
  const view = await findInvitation(db, { token, userId });
  if (!view) return { ok: false, code: "invitation_not_found" };
  if (result) return { ok: true, emergencyId: result, slug: view.emergency.slug };
  if (view.status !== "valid") return { ok: false, code: view.status };
  const membership = await findMembership(db, { emergencyId: view.emergency.id, userId });
  if (membership && ROLE_RANK[membership.role] >= ROLE_RANK[view.role]) {
    // Already in with this role or more: a volunteer link just lets them through.
    return view.role === "volunteer"
      ? { ok: true, emergencyId: view.emergency.id, slug: view.emergency.slug }
      : { ok: false, code: "already_has_role" };
  }
  return { ok: false, code: "used_up" };
}
