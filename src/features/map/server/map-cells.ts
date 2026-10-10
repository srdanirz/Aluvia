import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";

import { type AttentionLevel, levelRank } from "../attention";
import { type Bbox, cellRangeForBbox, clusterFactorForZoom, CELL_DEGREES } from "../grid";
import { attentionLevelSql, levelRankSql, staleBeforeSql } from "./attention-level";
import { publicAddressSql } from "./public-address";

// A block that cannot be split further lists its homes so the map can offer them one by one. A
// flooded block can hold more than this; the panel says how many are left out.
const CELL_MEMBERS_MAX = 50;
// Ids one response may carry in block lists: above street zoom, blocks listing their homes could
// otherwise add up to tens of thousands. Street zoom always sends every id.
const RESPONSE_IDS_MAX = 5000;
// Points one street-zoom response may carry: a phone at zoom 18 sees a few blocks, so this is a
// dense neighborhood several times over, and a scripted client cannot pull a whole city.
const STREET_POINTS_MAX = 2000;
// Homes this close share one marker (a building, two reports with the same pin) and open as a
// list, instead of stacking markers nobody can tap apart: about 10 cm.
const SAME_POINT_DECIMALS = 6;

/** A home inside a listed block: its written address tells it apart from its neighbors (ADR 0017). */
export type MapCellHome = { id: string; level: AttentionLevel; address: string | null };

export type MapCell = {
  position: { lat: number; lng: number };
  count: number;
  levels: Record<AttentionLevel, number>;
  /**
   * The homes in the cell, most urgent first; present when the group sits in one block (and above
   * street zoom, while the response's id budget lasts).
   */
  worksites: MapCellHome[] | null;
  /** Area to zoom to when the cell is tapped; it hugs its homes' grid cells. */
  bounds: Bbox;
};

/** The groups of a bbox; `truncated` when street zoom had more points than one response holds. */
export type MapCells = { items: MapCell[]; truncated: boolean };

type CellRow = Record<AttentionLevel, number> & {
  lat: number;
  lng: number;
  count: number;
  members: MapCellHome[] | null;
  min_x: number;
  min_y: number;
  max_x: number;
  max_y: number;
};

/** Most urgent level first, then the larger group. */
function byUrgency(a: CellRow, b: CellRow): number {
  return levelRank(a) - levelRank(b) || b.count - a.count;
}

/**
 * Homes of an emergency inside a bbox, grouped into map cells for a zoom, in one query. A group
 * sits at the average of its homes' points; from street zoom (one grid cell per group) every
 * point is its own item, and homes on the same point open as a list (ADR 0011). Only public fields:
 * never contact data.
 * Null when the slug is not an emergency (checked only when nothing came back, so a map read
 * stays one query).
 */
export async function listMapCells(
  { slug, bbox, zoom, now }: { slug: string; bbox: Bbox; zoom: number; now: Date },
  database: Executor = db,
): Promise<MapCells | null> {
  const range = cellRangeForBbox(bbox);
  const factor = clusterFactorForZoom(zoom);
  const cell = CELL_DEGREES;

  const rows = await database.execute<CellRow>(sql`
    WITH site AS (
      SELECT
        w.id,
        ST_X(w.location) AS x,
        ST_Y(w.location) AS y,
        floor(ST_X(w.location) / ${cell})::int AS gx,
        floor(ST_Y(w.location) / ${cell})::int AS gy,
        w.source,
        ${attentionLevelSql(staleBeforeSql(now))} AS level,
        ${publicAddressSql(sql`c.address_text`)} AS address
      FROM worksites w
      JOIN emergencies e ON e.id = w.emergency_id
      LEFT JOIN emergency_settings es ON es.emergency_id = e.id
      LEFT JOIN work_items wi ON wi.worksite_id = w.id AND wi.emergency_id = w.emergency_id
      LEFT JOIN worksite_contacts c ON c.worksite_id = w.id
      WHERE e.slug = ${slug}
        AND ST_Intersects(
          w.location,
          ST_MakeEnvelope(
            ${range.minX * cell}::float8, ${range.minY * cell}::float8,
            ${(range.maxX + 1) * cell}::float8, ${(range.maxY + 1) * cell}::float8,
            4326
          )
        )
      GROUP BY w.id, e.id, es.emergency_id, c.worksite_id
    ),
    visible AS (
      SELECT * FROM site
      WHERE gx BETWEEN ${range.minX}::int AND ${range.maxX}::int
        AND gy BETWEEN ${range.minY}::int AND ${range.maxY}::int
        -- Imported official parcels nobody asked about stay off the map: thousands of grey pins hid
        -- the few homes that need someone. They still back reports (address, duplicates).
        AND NOT (source = 'official' AND level = 'no_request')
    )
    SELECT
      avg(y)::float8 AS lat,
      avg(x)::float8 AS lng,
      count(*)::int AS count,
      (count(*) FILTER (WHERE level = 'do_not_enter'))::int AS do_not_enter,
      (count(*) FILTER (WHERE level = 'unattended'))::int AS unattended,
      (count(*) FILTER (WHERE level = 'unconfirmed'))::int AS unconfirmed,
      (count(*) FILTER (WHERE level = 'no_request'))::int AS no_request,
      (count(*) FILTER (WHERE level = 'in_progress'))::int AS in_progress,
      (count(*) FILTER (WHERE level = 'attended'))::int AS attended,
      CASE WHEN min(gx) = max(gx) AND min(gy) = max(gy) THEN
        -- to_json: the driver parses json, not json[].
        to_json((array_agg(
          json_build_object('id', id, 'level', level, 'address', address)
          ORDER BY ${levelRankSql(sql`level`)}, id
        ))[1:${CELL_MEMBERS_MAX}::int])
      END AS members,
      min(gx) AS min_x, min(gy) AS min_y, max(gx) AS max_x, max(gy) AS max_y
    FROM visible
    ${
      factor === 1
        ? sql`GROUP BY round(x::numeric, ${SAME_POINT_DECIMALS}::int), round(y::numeric, ${SAME_POINT_DECIMALS}::int)
              ORDER BY min(${levelRankSql(sql`level`)}), count(*) DESC, min(id::text) LIMIT ${STREET_POINTS_MAX + 1}::int`
        : sql`GROUP BY floor(gx::float8 / ${factor}::int), floor(gy::float8 / ${factor}::int)`
    }
  `);

  // One row past the cap says there were more points than the response carries.
  const truncated = rows.length > STREET_POINTS_MAX;
  if (truncated) rows.length = STREET_POINTS_MAX;

  if (rows.length === 0) {
    const [emergency] = await database.execute(sql`SELECT 1 FROM emergencies WHERE slug = ${slug}`);
    return emergency ? { items: [], truncated: false } : null;
  }

  // Above street zoom, the most urgent groups keep their lists when the budget runs out; the rest
  // open by zooming in. At street zoom every point keeps its ids, so every home can be opened.
  const listed = new Set<CellRow>();
  let idBudget = factor === 1 ? Infinity : RESPONSE_IDS_MAX;
  for (const row of [...rows].sort(byUrgency)) {
    if (row.members && row.members.length <= idBudget) {
      idBudget -= row.members.length;
      listed.add(row);
    }
  }

  const items = rows.map((row) => ({
    position: { lat: row.lat, lng: row.lng },
    count: row.count,
    levels: {
      do_not_enter: row.do_not_enter,
      unattended: row.unattended,
      unconfirmed: row.unconfirmed,
      no_request: row.no_request,
      in_progress: row.in_progress,
      attended: row.attended,
    },
    worksites: listed.has(row) ? row.members : null,
    bounds: {
      west: row.min_x * cell,
      south: row.min_y * cell,
      east: (row.max_x + 1) * cell,
      north: (row.max_y + 1) * cell,
    },
  }));
  return { items, truncated };
}
