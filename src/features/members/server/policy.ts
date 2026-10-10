import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import { isPlatformAdminSql } from "./roles";

/**
 * Members are managed by platform admins (issue #16, ADR 0009): they approve coordinators and
 * field volunteers, invite, and assign homes. Writes re-check it inside their own statement.
 */
export async function canManageMembers(db: Executor, actorId: string): Promise<boolean> {
  const [row] = await db.execute<{ is_admin: boolean }>(
    sql`SELECT ${isPlatformAdminSql(actorId)} AS is_admin`,
  );
  return row?.is_admin ?? false;
}
