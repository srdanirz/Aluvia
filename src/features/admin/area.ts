import { z } from "zod";

// Server Actions accept 1 MB bodies by default; leave room for the rest of the form.
export const AREA_MAX_CHARS = 900_000;

const position = z
  .array(z.number())
  .min(2)
  .max(3)
  .refine(([lng = 0, lat = 0]) => Math.abs(lng) <= 180 && Math.abs(lat) <= 90);
const ring = z
  .array(position)
  .min(4)
  .refine((points) => {
    const first = points[0];
    const last = points.at(-1);
    return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
  });
const polygon = z.array(ring).min(1);
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygon).min(1) }),
]);
const feature = z.object({ type: z.literal("Feature"), geometry });
const geoJson = z.union([
  geometry,
  feature,
  z.object({ type: z.literal("FeatureCollection"), features: z.array(feature).min(1) }),
]);

type Geometry = z.infer<typeof geometry>;

function toMultiPolygon(parsed: z.infer<typeof geoJson>): string {
  const geometries: Geometry[] =
    parsed.type === "FeatureCollection"
      ? parsed.features.map((f) => f.geometry)
      : [parsed.type === "Feature" ? parsed.geometry : parsed];
  const coordinates = geometries.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
  return JSON.stringify({ type: "MultiPolygon", coordinates });
}

/**
 * An emergency's area from an uploaded GeoJSON file: a Polygon, a MultiPolygon, a Feature or a
 * FeatureCollection of them, in WGS 84 as the format requires. Parses to one MultiPolygon as JSON,
 * ready for ST_GeomFromGeoJSON. Only the shape is checked here; whether the polygon is valid
 * (no self-intersections) is decided by the database's ST_IsValid check.
 */
export const areaSchema = z
  .string()
  .max(AREA_MAX_CHARS, { error: "area_too_large" })
  .transform((text, ctx) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = geoJson.safeParse(json);
    if (!parsed.success) {
      ctx.addIssue({ code: "custom", message: "invalid_geojson" });
      return z.NEVER;
    }
    return toMultiPolygon(parsed.data);
  });
