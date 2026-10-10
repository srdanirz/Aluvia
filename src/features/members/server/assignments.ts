import "server-only";

import { sql } from "drizzle-orm";

import { adminEvents } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

import { canManageMembers } from "./policy";
import { isPlatformAdminSql } from "./roles";

type Assignment = { emergencyId: string; worksiteId: string; userId: string };

const FOREIGN_KEY_VIOLATION = "23503";

function isForeignKeyViolation(error: unknown): boolean {
  return (error as { cause?: { code?: string } }).cause?.code === FOREIGN_KEY_VIOLATION;
}

/**
 * Lets a field volunteer update one home. Only a field volunteer of the home's own emergency can
 * hold it: the select picks the role and the composite keys reject a home of another emergency.
 */
export async function assignWorksite(
  db: Executor,
  actorId: string,
  { emergencyId, worksiteId, userId }: Assignment,
): Promise<{ ok: true } | { ok: false; code: "forbidden" | "not_field_volunteer" | "worksite_not_found" }> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  try {
    return await db.transaction(async (tx) => {
      // DO UPDATE with no change, so an existing assignment still returns its row; xmax = 0 marks a fresh insert.
      const [row] = await tx.execute<{ inserted: boolean }>(sql`
        INSERT INTO worksite_assignments (emergency_id, worksite_id, user_id, assigned_by)
        SELECT emergency_id, ${worksiteId}, user_id, ${actorId} FROM emergency_members
        WHERE emergency_id = ${emergencyId} AND user_id = ${userId} AND role = 'field_volunteer'
          AND ${isPlatformAdminSql(actorId)}
          AND EXISTS (SELECT 1 FROM emergencies WHERE id = ${emergencyId} AND status = 'open')
        ON CONFLICT (worksite_id, user_id) DO UPDATE SET assigned_at = worksite_assignments.assigned_at
        RETURNING (xmax = 0) AS inserted`);
      if (!row) return { ok: false, code: "not_field_volunteer" } as const;
      if (row.inserted) {
        await tx.insert(adminEvents).values({
          actorId,
          action: "worksite_assigned",
          targetType: "worksite",
          targetId: worksiteId,
          emergencyId,
          payload: { userId },
        });
      }
      return { ok: true } as const;
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, code: "worksite_not_found" };
    throw error;
  }
}

export async function unassignWorksite(
  db: Executor,
  actorId: string,
  { emergencyId, worksiteId, userId }: Assignment,
): Promise<{ ok: true } | { ok: false; code: "forbidden" | "assignment_not_found" }> {
  if (!(await canManageMembers(db, actorId))) return { ok: false, code: "forbidden" };

  return db.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      DELETE FROM worksite_assignments
      WHERE emergency_id = ${emergencyId} AND worksite_id = ${worksiteId} AND user_id = ${userId}
        AND ${isPlatformAdminSql(actorId)}
      RETURNING 1`);
    if (rows.length === 0) return { ok: false, code: "assignment_not_found" } as const;
    await tx.insert(adminEvents).values({
      actorId,
      action: "worksite_unassigned",
      targetType: "worksite",
      targetId: worksiteId,
      emergencyId,
      payload: { userId },
    });
    return { ok: true } as const;
  });
}
