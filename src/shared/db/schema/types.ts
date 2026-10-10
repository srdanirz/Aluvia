import { sql } from "drizzle-orm";
import { type AnyPgColumn, customType } from "drizzle-orm/pg-core";
import { parseEWKB } from "drizzle-orm/pg-core/columns/postgis_extension/utils";

/** Text in several languages, `{ "es": "...", "en": "..." }`; read with the emergency's default as fallback (ADR 0009). */
export type LocalizedText = Record<string, string>;

/** Longitude and latitude in WGS 84. */
export type Point = { x: number; y: number };

/**
 * A WGS 84 point, typed in the DDL as `geometry(Point, 4326)` so Postgres rejects any other SRID.
 * Drizzle's own `geometry()` drops the SRID from the DDL and writes SRID 0, which breaks every
 * `ST_MakeEnvelope(..., 4326)` bbox query with "mixed SRID".
 */
export const wgs84Point = customType<{ data: Point; driverData: string }>({
  dataType: () => "geometry(Point, 4326)",
  toDriver: ({ x, y }) => sql`ST_SetSRID(ST_MakePoint(${x}, ${y}), 4326)`,
  fromDriver: (hex) => {
    const [x, y] = parseEWKB(hex);
    return { x, y };
  },
});

/** An emergency's area. Written and read through PostGIS functions (ST_GeomFromGeoJSON, ST_AsGeoJSON), never parsed in JS. */
export const multiPolygon = customType<{ data: string; driverData: string }>({
  dataType: () => "geometry(MultiPolygon, 4326)",
});

/** BCP 47 language tag check, `es` or `es-CL`, so notification copy can be looked up. */
export const localeTag = (column: AnyPgColumn) => sql`${column} ~ '^[a-z]{2,3}(-[A-Z]{2})?$'`;

/** E.164 phone check (ADR 0007): `+` and 8 to 15 digits. */
export const e164 = (column: AnyPgColumn) => sql`${column} ~ '^\\+[1-9][0-9]{7,14}$'`;
