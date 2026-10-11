import "server-only";

import { sql } from "drizzle-orm";

import { adminEvents } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

import type { OrganizationErrorCode, OrganizationInput } from "../schemas";

const isPlatformAdminSql = (userId: string) =>
  sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND platform_role = 'admin')`;

/**
 * Creates an organization in an open emergency (ADR 0019). Platform admins only, checked inside
 * the INSERT; the unique index on the normalized name makes two admins creating the same group
 * at once end with one row and one `organization_exists`.
 */
export async function createOrganization(
  db: Executor,
  actorId: string,
  input: OrganizationInput,
): Promise<
  { ok: true; organizationId: string } | { ok: false; code: Exclude<OrganizationErrorCode, "invalid_input"> }
> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO organizations (emergency_id, name, public_contact, created_by)
      SELECT id, ${input.name}, ${input.publicContact}, ${actorId}
      FROM emergencies WHERE id = ${input.emergencyId} AND status = 'open' AND ${isPlatformAdminSql(actorId)}
      ON CONFLICT (emergency_id, lower(btrim(name))) DO NOTHING
      RETURNING id`);
    if (!row) {
      // Only the message is picked here; the INSERT above already decided.
      const [why] = await tx.execute<{ is_admin: boolean; is_open: boolean }>(sql`
        SELECT ${isPlatformAdminSql(actorId)} AS is_admin,
          EXISTS (SELECT 1 FROM emergencies WHERE id = ${input.emergencyId} AND status = 'open') AS is_open`);
      if (!why?.is_admin) return { ok: false, code: "forbidden" } as const;
      return { ok: false, code: why.is_open ? "organization_exists" : "emergency_closed" } as const;
    }
    await tx.insert(adminEvents).values({
      actorId,
      action: "organization_created",
      targetType: "organization",
      targetId: row.id,
      emergencyId: input.emergencyId,
    });
    return { ok: true, organizationId: row.id } as const;
  });
}
