import "server-only";

import { sql } from "drizzle-orm";

import { canViewContacts, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

export type WorksiteContactView = {
  addressText: string | null;
  name: string | null;
  phone: string | null;
  notes: string | null;
  /** Someone vulnerable lives there: coordinators only, never public (ADR 0011). */
  hasVulnerablePeople: boolean;
};

/**
 * A home's contact for whoever may see it (a coordinator of the emergency, or a platform admin),
 * logged in contact_views in the same transaction as the read. Null for everyone else, and when
 * the home has no contact at all (nothing read, nothing logged).
 */
export async function loadWorksiteContact(
  { emergencyId, worksiteId }: { emergencyId: string; worksiteId: string },
  database: Executor = db,
): Promise<WorksiteContactView | null> {
  const access = await getEmergencyAccess(emergencyId);
  if (!access || !(canViewContacts(access) || access.isPlatformAdmin)) return null;
  return readAndLogContact(database, { emergencyId, worksiteId, viewerId: access.userId });
}

export async function readAndLogContact(
  database: Executor,
  { emergencyId, worksiteId, viewerId }: { emergencyId: string; worksiteId: string; viewerId: string },
): Promise<WorksiteContactView | null> {
  return database.transaction(async (tx) => {
    const [row] = await tx.execute<{
      address_text: string | null;
      name: string | null;
      phone: string | null;
      notes: string | null;
      has_vulnerable_people: boolean;
    }>(sql`
      SELECT c.address_text, c.name, c.phone, c.notes, w.has_vulnerable_people
      FROM worksites w
      LEFT JOIN worksite_contacts c ON c.worksite_id = w.id
      WHERE w.id = ${worksiteId} AND w.emergency_id = ${emergencyId}
    `);
    if (!row) return null;
    if ((row.address_text ?? row.name ?? row.phone ?? row.notes) === null && !row.has_vulnerable_people)
      return null;
    await tx.execute(sql`
      INSERT INTO contact_views (emergency_id, user_id, worksite_id)
      VALUES (${emergencyId}, ${viewerId}, ${worksiteId})
    `);
    return {
      addressText: row.address_text,
      name: row.name,
      phone: row.phone,
      notes: row.notes,
      hasVulnerablePeople: row.has_vulnerable_people,
    };
  });
}
