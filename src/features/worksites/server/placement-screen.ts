import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";

import { getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

import { canPlaceWorksite } from "./policy";
import { findOpenEmergencyId } from "./queries";

export type PlacementTarget = {
  id: string;
  version: number;
  location: { lng: number; lat: number } | null;
  addressText: string | null;
  notes: string | null;
};

type Row = {
  emergency_id: string;
  id: string;
  version: number;
  lng: number | null;
  lat: number | null;
  address_text: string | null;
  notes: string | null;
};

/**
 * A home to place on the map, with its written address, for a coordinator of its emergency.
 * Reading the address is a contact view, so it is logged in the same transaction (SECURITY.md).
 */
export async function findPlacementTarget(
  database: Executor,
  { slug, worksiteId, viewerId }: { slug: string; worksiteId: string; viewerId: string },
): Promise<PlacementTarget | null> {
  return database.transaction(async (tx) => {
    const [row] = await tx.execute<Row>(sql`
      SELECT w.emergency_id, w.id, w.version, ST_X(w.location) AS lng, ST_Y(w.location) AS lat,
        c.address_text, c.notes
      FROM worksites w
      JOIN emergencies e ON e.id = w.emergency_id AND e.slug = ${slug} AND e.status = 'open'
      LEFT JOIN worksite_contacts c ON c.worksite_id = w.id
      WHERE w.id = ${worksiteId}
    `);
    if (!row) return null;
    if (row.address_text !== null || row.notes !== null) {
      await tx.execute(sql`
        INSERT INTO contact_views (emergency_id, user_id, worksite_id)
        VALUES (${row.emergency_id}, ${viewerId}, ${row.id})
      `);
    }
    return {
      id: row.id,
      version: row.version,
      location: row.lng !== null && row.lat !== null ? { lng: row.lng, lat: row.lat } : null,
      addressText: row.address_text,
      notes: row.notes,
    };
  });
}

/** The placement screen: null if the home is not in that open emergency, `forbidden` for non-coordinators. */
export async function getPlacementScreen({
  slug,
  worksiteId,
}: {
  slug: string;
  worksiteId: string;
}): Promise<{ status: "forbidden" } | { status: "ok"; target: PlacementTarget } | null> {
  // The id comes from the URL; a malformed one is a 404, not a database error.
  if (!z.uuid().safeParse(worksiteId).success) return null;
  const emergencyId = await findOpenEmergencyId(slug);
  if (!emergencyId) return null;
  const access = await getEmergencyAccess(emergencyId);
  if (!access || !canPlaceWorksite(access)) return { status: "forbidden" };
  const target = await findPlacementTarget(db, { slug, worksiteId, viewerId: access.userId });
  return target ? { status: "ok", target } : null;
}
