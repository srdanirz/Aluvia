import "server-only";

import { sql } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

import type { Bbox } from "../grid";

// Simplifies the drawn area to ~5 m: invisible on screen, and a hand-drawn or imported polygon
// with thousands of vertices stays a few KB in every map load.
const AREA_SIMPLIFY_DEGREES = 0.00005;

/** Rings of a polygon, outer first, as the map draws them. */
export type AreaPolygon = { lat: number; lng: number }[][];

export type MapEmergency = {
  slug: string;
  name: string;
  /** The official affected area, if the admin set one. */
  area: AreaPolygon[] | null;
  /** Where the map opens: the emergency's area, else its homes, else null (the whole world). */
  bounds: Bbox | null;
};

type EmergencyRow = {
  name: string;
  area: string | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
};

/** GeoJSON MultiPolygon coordinates, [lng, lat] per vertex, to the map's rings. */
function toAreaPolygons(geojson: string): AreaPolygon[] {
  const { coordinates } = JSON.parse(geojson) as { coordinates: [number, number][][][] };
  return coordinates.map((rings) => rings.map((ring) => ring.map(([lng, lat]) => ({ lat, lng }))));
}

/**
 * The emergency a map shows, or null if the slug does not exist. Cached for minutes: name and
 * area change rarely, and every map load reads them.
 */
export async function findMapEmergency(slug: string, locale: string): Promise<MapEmergency | null> {
  "use cache";
  cacheLife("minutes");
  return findMapEmergencyUncached({ slug, locale });
}

export async function findMapEmergencyUncached(
  { slug, locale }: { slug: string; locale: string },
  database: Executor = db,
): Promise<MapEmergency | null> {
  const [row] = await database.execute<EmergencyRow>(sql`
    SELECT
      coalesce(e.name ->> ${locale}, e.name ->> e.default_locale) AS name,
      ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(e.area, ${AREA_SIMPLIFY_DEGREES})), 6) AS area,
      ST_XMin(b.box) AS west, ST_YMin(b.box) AS south, ST_XMax(b.box) AS east, ST_YMax(b.box) AS north
    FROM emergencies e
    CROSS JOIN LATERAL (
      SELECT coalesce(
        e.area::box2d,
        (SELECT ST_Extent(w.location) FROM worksites w WHERE w.emergency_id = e.id)
      ) AS box
    ) b
    WHERE e.slug = ${slug}
  `);
  if (!row) return null;
  const { west, south, east, north } = row;
  const bounds =
    west === null || south === null || east === null || north === null ? null : { west, south, east, north };
  return { slug, name: row.name, area: row.area ? toAreaPolygons(row.area) : null, bounds };
}
