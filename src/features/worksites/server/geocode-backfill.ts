import "server-only";

import { sql } from "drizzle-orm";

import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import { geocodeAddress, type GeocodeOutcome } from "./geocode-address";
import { DUPLICATE_RADIUS_METERS } from "./queries";

// One run handles at most this many homes; a rerun picks up the rest (the summary says how many).
// Bounds the paid Geocoding calls of a single run and the memory of the batched UPDATE.
const BACKFILL_BATCH = 500;

type Candidate = {
  id: string;
  address_text: string;
  parcel_lng: number | null;
  parcel_lat: number | null;
  west: number | null;
  south: number | null;
  east: number | null;
  north: number | null;
  comunas: string[];
};

export type BackfillSummary = {
  candidates: number;
  remaining: number;
  placedByParcel: number;
  placedByGeocoder: number;
  updated: number;
  notPlaced: Partial<Record<GeocodeOutcome, number>>;
};

/**
 * Places homes saved with a written address but no point, the ones reported before the server
 * located addresses (ADR 0016), using the same two sources as a new report in the same order: the
 * one official parcel with the same street and number (address_key), then the Geocoding API near
 * the emergency's area. Both give a door-level point, so a placed home also loses its
 * `imprecise_location` flag; a home neither source places is left as it was, still in review.
 *
 * Idempotent: the write only touches homes still without a point, so a rerun, or a coordinator
 * placing the pin meanwhile, never moves a point. Returns counts only: the addresses never leave
 * this function. Geocoding calls run one after another (a one-off over a handful of homes).
 */
export async function backfillWorksiteLocations(database: Executor): Promise<BackfillSummary> {
  const rows = await database.execute<Candidate & { total: number }>(sql`
    SELECT w.id, c.address_text,
      ST_X(p.location) AS parcel_lng, ST_Y(p.location) AS parcel_lat,
      ST_XMin(e.area) AS west, ST_YMin(e.area) AS south, ST_XMax(e.area) AS east, ST_YMax(e.area) AS north,
      array_to_json(e.comunas) AS comunas,
      count(*) OVER ()::int AS total
    FROM worksites w
    JOIN worksite_contacts c ON c.worksite_id = w.id
    JOIN emergencies e ON e.id = w.emergency_id
    LEFT JOIN LATERAL (
      SELECT (array_agg(pw.location))[1] AS location
      FROM worksites pw JOIN worksite_contacts pc ON pc.worksite_id = pw.id
      WHERE pw.emergency_id = w.emergency_id AND pw.source = 'official' AND pw.location IS NOT NULL
        AND pc.address_key = c.address_key
      -- Two parcels sharing the key (units of one building, a survey typo) would make it a guess.
      HAVING count(*) = 1
    ) p ON true
    WHERE w.location IS NULL AND w.source <> 'official'
      AND c.address_text IS NOT NULL AND btrim(c.address_text) <> ''
    ORDER BY w.created_at, w.id
    LIMIT ${BACKFILL_BATCH}`);

  const placed: { id: string; lng: number; lat: number }[] = [];
  const notPlaced: Partial<Record<GeocodeOutcome, number>> = {};
  let placedByParcel = 0;
  let placedByGeocoder = 0;

  await rows.reduce(async (previous, row) => {
    await previous;
    if (row.parcel_lng !== null && row.parcel_lat !== null) {
      placed.push({ id: row.id, lng: row.parcel_lng, lat: row.parcel_lat });
      placedByParcel += 1;
      return;
    }
    const { west, south, east, north } = row;
    const area =
      west !== null && south !== null && east !== null && north !== null
        ? { west, south, east, north }
        : null;
    const { point, outcome } = await geocodeAddress(row.address_text, { area, comunas: row.comunas });
    if (point) {
      placed.push({ id: row.id, ...point });
      placedByGeocoder += 1;
    } else {
      notPlaced[outcome] = (notPlaced[outcome] ?? 0) + 1;
    }
  }, Promise.resolve());

  let updated = 0;
  if (placed.length > 0) {
    const result = await database.execute<{ id: string }>(sql`
      UPDATE worksites w
      SET location = ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326),
        -- Same rules as a new report (submit-report.ts): outside_area is decided again, and another
        -- home within DUPLICATE_RADIUS_METERS asks a coordinator to compare them.
        review_flags = array_remove(
          ARRAY(SELECT DISTINCT unnest(
            array_remove(array_remove(w.review_flags, 'imprecise_location'), 'outside_area')
            || ARRAY[
              (SELECT 'outside_area' FROM emergencies e
                WHERE e.id = w.emergency_id AND e.area IS NOT NULL
                  AND NOT ST_Intersects(e.area, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326))),
              (SELECT 'possible_duplicate' WHERE EXISTS (
                SELECT 1 FROM worksites other
                WHERE other.emergency_id = w.emergency_id AND other.id <> w.id
                  AND ST_DWithin(other.location::geography,
                    ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography, ${DUPLICATE_RADIUS_METERS})))
            ]::worksite_review_flag[])),
          NULL),
        version = w.version + 1,
        updated_at = now()
      FROM unnest(
        ${sqlArray(
          placed.map((p) => p.id),
          "uuid",
        )},
        ${sqlArray(
          placed.map((p) => String(p.lng)),
          "text",
        )}::float8[],
        ${sqlArray(
          placed.map((p) => String(p.lat)),
          "text",
        )}::float8[]
      ) AS p(id, lng, lat)
      WHERE w.id = p.id AND w.location IS NULL
      RETURNING w.id`);
    updated = result.length;
  }

  const total = rows[0]?.total ?? 0;
  return {
    candidates: rows.length,
    remaining: total - updated,
    placedByParcel,
    placedByGeocoder,
    updated,
    notPlaced,
  };
}
