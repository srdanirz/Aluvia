import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { worksites } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";

import { listNearbyWorksites } from "./queries";

export type PlaceWorksiteResult =
  | { ok: true; version: number }
  | { ok: false; code: "possible_duplicate"; nearby: { id: string; distanceMeters: number }[] }
  | { ok: false; code: "stale_version" };

/**
 * Puts or moves a home's pin. A pin within DUPLICATE_RADIUS_METERS of another home is refused
 * with `possible_duplicate` until the caller confirms with `allowNearby`. The check and the write
 * run under one lock per emergency, so two pins placed at the same time see each other; the
 * write is also guarded by `version` (STYLEGUIDE, bloqueo optimista).
 */
export async function placeWorksite(
  database: Executor,
  {
    emergencyId,
    worksiteId,
    location,
    version,
    allowNearby,
  }: {
    emergencyId: string;
    worksiteId: string;
    location: { lng: number; lat: number };
    version: number;
    allowNearby: boolean;
  },
): Promise<PlaceWorksiteResult> {
  // Two pins placed at once could each miss the other, so placements in one emergency take turns
  // on a transaction lock; coordinators place a handful a minute, the wait is nothing.
  return database.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`place_worksite:${emergencyId}`}))`);
    if (!allowNearby) {
      const nearby = await listNearbyWorksites({ emergencyId, location, excludeId: worksiteId }, tx);
      if (nearby.length > 0) return { ok: false, code: "possible_duplicate", nearby };
    }
    const [row] = await tx
      .update(worksites)
      .set({
        location: { x: location.lng, y: location.lat },
        // The pin is new, so "outside the area" is decided again; "possible duplicate" goes away
        // because the nearby homes were just checked (none, or the caller confirmed), and a pin
        // placed by hand is not an imprecise GPS fix.
        reviewFlags: sql`array_remove(
          array_remove(array_remove(array_remove(${worksites.reviewFlags}, 'outside_area'), 'possible_duplicate'), 'imprecise_location')
            || ARRAY[(SELECT 'outside_area' FROM emergencies e
                      WHERE e.id = ${emergencyId} AND e.area IS NOT NULL
                        AND NOT ST_Intersects(e.area, ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)))]::worksite_review_flag[],
          NULL)`,
        version: sql`${worksites.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(worksites.id, worksiteId),
          eq(worksites.emergencyId, emergencyId),
          eq(worksites.version, version),
        ),
      )
      .returning({ version: worksites.version });
    return row ? { ok: true, version: row.version } : { ok: false, code: "stale_version" };
  });
}
