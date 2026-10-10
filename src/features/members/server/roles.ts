import "server-only";

import { type SQL, sql } from "drizzle-orm";

import type { MemberRole } from "@/shared/auth";

/**
 * Roles from least to most: a coordinator can do everything a field volunteer can. Granting
 * never steps someone down; only revoking does.
 */
export const ROLE_RANK: Record<MemberRole, number> = { volunteer: 0, field_volunteer: 1, coordinator: 2 };

/** ROLE_RANK in SQL, for comparisons inside a statement. */
export function roleRank(role: SQL): SQL {
  return sql`(CASE ${role} WHEN 'volunteer' THEN 0 WHEN 'field_volunteer' THEN 1 WHEN 'coordinator' THEN 2 END)`;
}

/** Inside a statement: whether `userId` (a value or a column) is a platform admin right now. */
export function isPlatformAdminSql(userId: string | SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND platform_role = 'admin')`;
}
