import "server-only";

import { sql } from "drizzle-orm";

import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import type { CollectionPointStatus } from "../schemas";

// Collection points are a handful per emergency (a gym, a parish, a fire station). The cap keeps
// the map query bounded; it is far above any real emergency's count.
const MAX_POINTS = 200;

/** A collection point as every map viewer sees it. `accepts` holds supply keys of the emergency. */
export type MapCollectionPoint = {
  id: string;
  name: string;
  lng: number;
  lat: number;
  address: string | null;
  openingHours: string | null;
  accepts: string[];
  status: CollectionPointStatus;
  statusNote: string | null;
  phone: string | null;
  version: number;
};

/** The emergency's supply catalog in the viewer's language; inactive keys still name old points. */
export type SupplyOption = { key: string; name: string; isActive: boolean };

export type MapCollectionPoints = { points: MapCollectionPoint[]; supplyTypes: SupplyOption[] };

/** Active points of an emergency and the supply names they use, in one query. Empty for an unknown slug. */
export async function listActiveCollectionPoints(
  db: Executor,
  { slug, locale }: { slug: string; locale: string },
): Promise<MapCollectionPoints> {
  const [row] = await db.execute<{ points: MapCollectionPoint[]; supply_types: SupplyOption[] }>(sql`
    SELECT
      coalesce((
        SELECT json_agg(p.point ORDER BY p.created_at, p.id)
        FROM (
          SELECT c.created_at, c.id, json_build_object(
              'id', c.id, 'name', c.name, 'lng', ST_X(c.location), 'lat', ST_Y(c.location),
              'address', c.address, 'openingHours', c.opening_hours, 'accepts', c.accepts,
              'status', c.status, 'statusNote', c.status_note, 'phone', c.phone, 'version', c.version
            ) AS point
          FROM collection_points c
          WHERE c.emergency_id = e.id AND c.removed_at IS NULL
          ORDER BY c.created_at, c.id
          LIMIT ${MAX_POINTS}
        ) p
      ), '[]'::json) AS points,
      coalesce((
        SELECT json_agg(json_build_object(
            'key', st.key,
            'name', coalesce(st.name ->> ${locale}, st.name ->> e.default_locale, st.key),
            'isActive', st.is_active
          ) ORDER BY st.sort_order, st.key)
        FROM supply_types st WHERE st.emergency_id = e.id
      ), '[]'::json) AS supply_types
    FROM emergencies e
    WHERE e.slug = ${slug}
  `);
  if (!row) return { points: [], supplyTypes: [] };
  return { points: row.points, supplyTypes: row.supply_types };
}

// Every key must be an active supply of the emergency. Postgres has no foreign key from an array
// element, so each write counts the keys inside its own statement instead of reading first.
const acceptsAreValid = (emergencyId: string, accepts: string[]) => sql`
  SELECT count(*) = ${accepts.length} AS ok
  FROM supply_types
  WHERE emergency_id = ${emergencyId} AND is_active AND key = ANY(${sqlArray(accepts, "text")})
`;

export type CreateCollectionPointInput = {
  id: string;
  emergencyId: string;
  name: string;
  lng: number;
  lat: number;
  address: string | null;
  openingHours: string | null;
  accepts: string[];
  phone: string | null;
  actorId: string;
};

/**
 * Creates a point, receiving. A retry with the same id is a no-op that answers ok, without reading
 * the existing row back. The admin event is written by the same statement.
 */
export async function createCollectionPoint(
  db: Executor,
  input: CreateCollectionPointInput,
): Promise<{ ok: true } | { ok: false; code: "invalid_supply_type" | "invalid_input" }> {
  const [row] = await db.execute<{ valid: boolean; saved: boolean }>(sql`
    WITH valid AS (${acceptsAreValid(input.emergencyId, input.accepts)}),
    created AS (
      INSERT INTO collection_points
        (id, emergency_id, name, location, address, opening_hours, accepts, phone, created_by, updated_by)
      SELECT ${input.id}::uuid, ${input.emergencyId}::uuid, ${input.name}::text,
        ST_SetSRID(ST_MakePoint(${input.lng}::float8, ${input.lat}::float8), 4326),
        ${input.address}::text, ${input.openingHours}::text, ${sqlArray(input.accepts, "text")},
        ${input.phone}::text, ${input.actorId}::uuid, ${input.actorId}::uuid
      FROM valid WHERE valid.ok
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    ),
    logged AS (
      INSERT INTO admin_events (actor_id, action, target_type, target_id, emergency_id, payload)
      SELECT ${input.actorId}::uuid, 'collection_point_created', 'collection_point', id::text,
        ${input.emergencyId}::uuid, '{}'::jsonb
      FROM created
    )
    SELECT
      (SELECT ok FROM valid) AS valid,
      -- Created now, or by an earlier try in this emergency. An id taken in another emergency is
      -- neither, and must not read as success.
      EXISTS (SELECT 1 FROM created)
        OR EXISTS (
          SELECT 1 FROM collection_points WHERE id = ${input.id} AND emergency_id = ${input.emergencyId}
        ) AS saved
  `);
  if (!row?.valid) return { ok: false, code: "invalid_supply_type" };
  return row.saved ? { ok: true } : { ok: false, code: "invalid_input" };
}

export type UpdateCollectionPointResult =
  { ok: true; version: number } | { ok: false; code: "not_found" | "stale_version" | "invalid_supply_type" };

/**
 * Changes a point's status, note and accepted supplies, only if it is still at the version the
 * coordinator saw (STYLEGUIDE, ediciones concurrentes). One statement decides and logs; the
 * other columns it returns only pick which code a refusal shows.
 */
export async function updateCollectionPoint(
  db: Executor,
  input: {
    id: string;
    emergencyId: string;
    version: number;
    status: CollectionPointStatus;
    statusNote: string | null;
    accepts: string[];
    actorId: string;
  },
): Promise<UpdateCollectionPointResult> {
  const [row] = await db.execute<{ valid: boolean; version: number | null; exists: boolean }>(sql`
    WITH valid AS (${acceptsAreValid(input.emergencyId, input.accepts)}),
    updated AS (
      UPDATE collection_points c SET
        status = ${input.status}, status_note = ${input.statusNote},
        accepts = ${sqlArray(input.accepts, "text")}, version = c.version + 1,
        updated_by = ${input.actorId}, updated_at = now()
      FROM valid
      WHERE valid.ok AND c.id = ${input.id} AND c.emergency_id = ${input.emergencyId}
        AND c.removed_at IS NULL AND c.version = ${input.version}
      RETURNING c.id, c.version
    ),
    logged AS (
      INSERT INTO admin_events (actor_id, action, target_type, target_id, emergency_id, payload)
      SELECT ${input.actorId}::uuid, 'collection_point_updated', 'collection_point', id::text,
        ${input.emergencyId}::uuid, jsonb_build_object('status', ${input.status}::text)
      FROM updated
    )
    SELECT
      (SELECT ok FROM valid) AS valid,
      (SELECT version FROM updated) AS version,
      EXISTS (
        SELECT 1 FROM collection_points
        WHERE id = ${input.id} AND emergency_id = ${input.emergencyId} AND removed_at IS NULL
      ) AS exists
  `);
  if (row?.version != null) return { ok: true, version: row.version };
  if (!row?.exists) return { ok: false, code: "not_found" };
  if (!row.valid) return { ok: false, code: "invalid_supply_type" };
  return { ok: false, code: "stale_version" };
}

/** Removes a point (stamps removed_at). False when it was not active in that emergency. */
export async function removeCollectionPoint(
  db: Executor,
  input: { id: string; emergencyId: string; actorId: string },
): Promise<boolean> {
  const rows = await db.execute(sql`
    WITH removed AS (
      UPDATE collection_points SET
        removed_at = now(), updated_at = now(), updated_by = ${input.actorId}, version = version + 1
      WHERE id = ${input.id} AND emergency_id = ${input.emergencyId} AND removed_at IS NULL
      RETURNING id
    ),
    logged AS (
      INSERT INTO admin_events (actor_id, action, target_type, target_id, emergency_id, payload)
      SELECT ${input.actorId}::uuid, 'collection_point_removed', 'collection_point', id::text,
        ${input.emergencyId}::uuid, '{}'::jsonb
      FROM removed
    )
    SELECT id FROM removed
  `);
  return rows.length > 0;
}
