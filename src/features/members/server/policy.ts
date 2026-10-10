import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

/**
 * Members are managed by platform admins (issue #16, ADR 0009): they approve coordinators and
 * field volunteers, invite, and assign homes. Writes re-check it inside their own statement.
 */
export async function canManageMembers(db: Executor, actorId: string): Promise<boolean> {
  const rows = await db.execute(sql`SELECT 1 FROM users WHERE id = ${actorId} AND platform_role = 'admin'`);
  return rows.length > 0;
}
