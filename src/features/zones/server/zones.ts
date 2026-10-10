import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import type { ZoneKind } from "../schemas";

/** A drawn zone as the map needs it: rings of [lng, lat], outer ring first. */
export type MapZone = { id: string; kind: ZoneKind; note: string | null; polygons: [number, number][][][] };

/** Active zones of an emergency. One query; the GeoJSON is built by PostGIS. */
export async function listActiveZones(db: Executor, slug: string): Promise<MapZone[]> {
  const rows = await db.execute<{ id: string; kind: ZoneKind; note: string | null; geojson: string }>(sql`
    SELECT z.id, z.kind, z.note, ST_AsGeoJSON(z.area, 6) AS geojson
    FROM emergency_zones z
    JOIN emergencies e ON e.id = z.emergency_id
    WHERE e.slug = ${slug} AND z.removed_at IS NULL
    ORDER BY z.created_at
  `);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    note: row.note,
    polygons: (JSON.parse(row.geojson) as { coordinates: [number, number][][][] }).coordinates,
  }));
}

/**
 * Draws a zone. The ring is closed and made valid in PostGIS; a retry with the same id is a no-op
 * that still answers ok. The admin event goes in the same transaction.
 */
export async function insertZone(
  db: Executor,
  input: {
    id: string;
    emergencyId: string;
    kind: ZoneKind;
    note: string | null;
    ring: [number, number][];
    actorId: string;
  },
): Promise<void> {
  const closed = [...input.ring, input.ring[0]];
  const geojson = JSON.stringify({ type: "Polygon", coordinates: [closed] });
  await db.transaction(async (tx) => {
    const created = await tx.execute(sql`
      INSERT INTO emergency_zones (id, emergency_id, kind, note, area, created_by)
      VALUES (
        ${input.id}, ${input.emergencyId}, ${input.kind}, ${input.note},
        ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)), 3)),
        ${input.actorId}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);
    if (created.length === 0) return;
    await tx.execute(sql`
      INSERT INTO admin_events (actor_id, action, target_type, target_id, emergency_id, payload)
      VALUES (${input.actorId}, 'zone_created', 'emergency_zone', ${input.id}, ${input.emergencyId},
        ${JSON.stringify({ kind: input.kind })}::jsonb)
    `);
  });
}

/** Removes a zone (stamps removed_at). Answers false when it was not active in that emergency. */
export async function removeZone(
  db: Executor,
  input: { id: string; emergencyId: string; actorId: string },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx.execute(sql`
      UPDATE emergency_zones SET removed_at = now(), removed_by = ${input.actorId}
      WHERE id = ${input.id} AND emergency_id = ${input.emergencyId} AND removed_at IS NULL
      RETURNING id
    `);
    if (removed.length === 0) return false;
    await tx.execute(sql`
      INSERT INTO admin_events (actor_id, action, target_type, target_id, emergency_id, payload)
      VALUES (${input.actorId}, 'zone_removed', 'emergency_zone', ${input.id}, ${input.emergencyId}, '{}'::jsonb)
    `);
    return true;
  });
}
