import "server-only";

import { sql } from "drizzle-orm";

import type { CatalogOption } from "@/features/worksites/server";
import { db } from "@/shared/db/client";
import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

/**
 * Reads of field updates. The current state of a home is its newest update that was not
 * cancelled; the partial index worksite_updates (worksite_id, created_at DESC) serves it.
 */

export type CurrentWorksiteUpdate = {
  /** Sent back as `previousUpdateId`: the version check of the next update (ADR 0018). */
  id: string;
  worksiteId: string;
  peoplePresent: number;
  missingSupplyKeys: string[];
  createdAt: Date;
};

export type UpdateForm = {
  emergency: { id: string; slug: string; name: string };
  worksiteId: string;
  supplyTypes: CatalogOption[];
  current: CurrentWorksiteUpdate | null;
};

type CurrentRow = {
  id: string;
  worksite_id: string;
  people_present: number;
  missing: string[];
  created_at: string;
};

const currentUpdates = (worksiteIds: ReturnType<typeof sqlArray>) => sql`
  SELECT DISTINCT ON (u.worksite_id)
    u.id,
    u.worksite_id,
    u.people_present,
    coalesce(
      (SELECT array_agg(s.supply_type_key ORDER BY s.supply_type_key)
        FROM worksite_update_supplies s WHERE s.update_id = u.id),
      '{}'
    ) AS missing,
    u.created_at
  FROM worksite_updates u
  WHERE u.worksite_id = ANY(${worksiteIds}) AND u.cancelled_at IS NULL
  ORDER BY u.worksite_id, u.created_at DESC, u.id DESC
`;

function toCurrent(row: CurrentRow): CurrentWorksiteUpdate {
  return {
    id: row.id,
    worksiteId: row.worksite_id,
    peoplePresent: row.people_present,
    missingSupplyKeys: row.missing,
    createdAt: new Date(row.created_at),
  };
}

/** Current state of many homes in one query, whatever their number (STYLEGUIDE, N+1). */
export async function listCurrentWorksiteUpdates(
  worksiteIds: readonly string[],
  database: Executor = db,
): Promise<CurrentWorksiteUpdate[]> {
  if (worksiteIds.length === 0) return [];
  const rows = await database.execute<CurrentRow>(currentUpdates(sqlArray(worksiteIds, "uuid")));
  return rows.map(toCurrent);
}

/**
 * Everything the update screen needs in one query: the open emergency, the home (only that it
 * exists there), the active supply catalog and the home's current state. Null if any is missing.
 */
export async function findUpdateForm(
  { slug, worksiteId, locale }: { slug: string; worksiteId: string; locale: string },
  database: Executor = db,
): Promise<UpdateForm | null> {
  const [row] = await database.execute<{
    emergency_id: string;
    slug: string;
    name: string;
    supply_types: CatalogOption[];
    current: CurrentRow | null;
  }>(sql`
    SELECT
      e.id AS emergency_id,
      e.slug,
      coalesce(e.name ->> ${locale}, e.name ->> e.default_locale) AS name,
      coalesce(
        (SELECT json_agg(
            json_build_object('key', st.key, 'name', coalesce(st.name ->> ${locale}, st.name ->> e.default_locale))
            ORDER BY st.sort_order, st.key)
          FROM supply_types st
          WHERE st.emergency_id = e.id AND st.is_active),
        '[]'::json
      ) AS supply_types,
      (SELECT row_to_json(c) FROM (${currentUpdates(sqlArray([worksiteId], "uuid"))}) c) AS current
    FROM emergencies e
    JOIN worksites w ON w.emergency_id = e.id AND w.id = ${worksiteId}
    WHERE e.slug = ${slug} AND e.status = 'open'
  `);
  if (!row) return null;
  return {
    emergency: { id: row.emergency_id, slug: row.slug, name: row.name },
    worksiteId,
    supplyTypes: row.supply_types,
    current: row.current ? toCurrent(row.current) : null,
  };
}

/** Emergency id of an open emergency that holds the home; null otherwise. */
export async function findUpdateTarget(
  { slug, worksiteId }: { slug: string; worksiteId: string },
  database: Executor = db,
): Promise<{ emergencyId: string } | null> {
  const [row] = await database.execute<{ id: string }>(sql`
    SELECT e.id FROM emergencies e
    JOIN worksites w ON w.emergency_id = e.id AND w.id = ${worksiteId}
    WHERE e.slug = ${slug} AND e.status = 'open'
  `);
  return row ? { emergencyId: row.id } : null;
}

/** The emergency's supply names in the viewer's language, by key; to show what a home is missing. */
export async function listSupplyNames(
  database: Executor,
  { emergencyId, locale }: { emergencyId: string; locale: string },
): Promise<Record<string, string>> {
  const rows = await database.execute<{ key: string; name: string }>(sql`
    SELECT st.key, coalesce(st.name ->> ${locale}, st.name ->> e.default_locale, st.key) AS name
    FROM supply_types st JOIN emergencies e ON e.id = st.emergency_id
    WHERE st.emergency_id = ${emergencyId}::uuid`);
  return Object.fromEntries(rows.map((row) => [row.key, row.name]));
}
