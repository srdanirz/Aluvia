import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

export type MapSummary = { homes: number; waiting: number };

/**
 * The two numbers the map panel opens with: homes on the map, and those with open work nobody has
 * taken (`unclaimed_since`, kept current by every work-item write). Cached for a minute, the same
 * refresh the map's own pins use.
 */
export async function loadMapSummary(slug: string): Promise<MapSummary | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
  return loadMapSummaryUncached(slug);
}

export async function loadMapSummaryUncached(
  slug: string,
  database: Executor = db,
): Promise<MapSummary | null> {
  const [row] = await database.execute<{ homes: number; waiting: number }>(sql`
    SELECT count(w.id)::int AS homes, count(w.unclaimed_since)::int AS waiting
    FROM emergencies e
    -- Same homes as the map: reported ones, and official parcels only once someone asked for them.
    LEFT JOIN worksites w ON w.emergency_id = e.id
      AND (w.source <> 'official' OR EXISTS (SELECT 1 FROM work_items wi WHERE wi.worksite_id = w.id))
    WHERE e.slug = ${slug}
    GROUP BY e.id
  `);
  return row ?? null;
}
