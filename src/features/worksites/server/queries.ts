import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

/**
 * Reads behind the report screens. Public: nothing here selects worksite_contacts. Names come
 * out in the requested locale with the emergency's default as fallback (ADR 0009).
 */

// Duplicate warning radius when a pin is placed (docs/investigacion/03, requisito 4): a house
// lot in a dense block is about 10 m wide, so 15 m catches the same home reported twice.
export const DUPLICATE_RADIUS_METERS = 15;
const NEARBY_MAX = 5;

export type CatalogOption = { key: string; name: string };

export type EmergencyNumber = { label: string; phone: string };

export type ReportForm = {
  emergency: { id: string; slug: string; name: string };
  workTypes: CatalogOption[];
  /** Shown first when someone is in danger; empty if the emergency has none configured. */
  emergencyNumbers: EmergencyNumber[];
};

/** An open emergency and its active work catalog, in one query; null if the slug is unknown or closed. */
export async function findReportForm(
  { slug, locale }: { slug: string; locale: string },
  database: Executor = db,
): Promise<ReportForm | null> {
  const [row] = await database.execute<{
    id: string;
    slug: string;
    name: string;
    work_types: CatalogOption[];
    emergency_numbers: EmergencyNumber[];
  }>(sql`
    SELECT
      e.id,
      e.slug,
      coalesce(e.name ->> ${locale}, e.name ->> e.default_locale) AS name,
      coalesce(
        (SELECT json_agg(
            json_build_object('key', wt.key, 'name', coalesce(wt.name ->> ${locale}, wt.name ->> e.default_locale))
            ORDER BY wt.sort_order, wt.key)
          FROM work_types wt
          WHERE wt.emergency_id = e.id AND wt.is_active),
        '[]'::json
      ) AS work_types,
      coalesce(
        (SELECT json_agg(
            json_build_object('label', coalesce(n.value -> 'label' ->> ${locale}, n.value -> 'label' ->> e.default_locale), 'phone', n.value ->> 'phone')
            ORDER BY n.ordinality)
          FROM emergency_settings es, jsonb_array_elements(es.emergency_numbers) WITH ORDINALITY AS n (value, ordinality)
          WHERE es.emergency_id = e.id),
        '[]'::json
      ) AS emergency_numbers
    FROM emergencies e
    WHERE e.slug = ${slug} AND e.status = 'open'
  `);
  if (!row) return null;
  return {
    emergency: { id: row.id, slug: row.slug, name: row.name },
    workTypes: row.work_types,
    emergencyNumbers: row.emergency_numbers,
  };
}

/** Id of an open emergency, for writes; null if the slug is unknown or closed. */
export async function findOpenEmergencyId(slug: string, database: Executor = db): Promise<string | null> {
  const [row] = await database.execute<{ id: string }>(
    sql`SELECT id FROM emergencies WHERE slug = ${slug} AND status = 'open'`,
  );
  return row?.id ?? null;
}

/** Other homes of the emergency within DUPLICATE_RADIUS_METERS of a point, nearest first. */
export async function listNearbyWorksites(
  {
    emergencyId,
    location,
    excludeId,
  }: { emergencyId: string; location: { lng: number; lat: number }; excludeId?: string },
  database: Executor = db,
): Promise<{ id: string; distanceMeters: number }[]> {
  const point = sql`ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography`;
  const rows = await database.execute<{ id: string; distance_meters: number }>(sql`
    SELECT id, round(ST_Distance(location::geography, ${point}))::int AS distance_meters
    FROM worksites
    WHERE emergency_id = ${emergencyId}
      AND ST_DWithin(location::geography, ${point}, ${DUPLICATE_RADIUS_METERS})
      AND id IS DISTINCT FROM ${excludeId ?? null}::uuid
    ORDER BY location::geography <-> ${point}
    LIMIT ${NEARBY_MAX}
  `);
  return rows.map((row) => ({ id: row.id, distanceMeters: row.distance_meters }));
}
