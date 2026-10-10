import { z } from "zod";

import {
  type Bbox,
  cellRangeForBbox,
  clusterFactorForZoom,
  countClusterCells,
  MAX_CELLS,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./grid";

const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);

/**
 * `bbox=west,south,east,north` in WGS 84 degrees. Boxes across the antimeridian are not supported.
 */
const bboxSchema = z
  .string()
  .transform((value) => value.split(",").map((part) => (part.trim() === "" ? Number.NaN : Number(part))))
  .pipe(z.tuple([longitude, latitude, longitude, latitude]))
  .transform(([west, south, east, north]) => ({ west, south, east, north }))
  .refine(({ west, east }) => west < east, { message: "west must be less than east" })
  .refine(({ south, north }) => south < north, { message: "south must be less than north" });

export const mapCellsQuerySchema = z.object({
  bbox: bboxSchema,
  // Not z.coerce: it would turn a missing or empty zoom into 0, the whole world.
  zoom: z
    .string()
    .regex(/^\d{1,2}$/)
    .transform(Number)
    .pipe(z.number().min(MIN_ZOOM).max(MAX_ZOOM)),
});

// The slug format belongs to the admin that creates emergencies; here it only has to be sane.
export const slugSchema = z.string().min(1).max(100);

export const worksiteIdSchema = z.uuid();

export type MapCellsQuery = { slug: string; bbox: Bbox; zoom: number };

/**
 * Validates a map cells request at the boundary. `bbox_too_large` when the box would hold more
 * cluster cells than MAX_CELLS at that zoom: the client asked for too much at once.
 */
export function parseMapCellsQuery(
  slug: string,
  params: URLSearchParams,
): { ok: true; data: MapCellsQuery } | { ok: false; code: "invalid_query" | "bbox_too_large" } {
  const parsed = mapCellsQuerySchema.safeParse({ bbox: params.get("bbox"), zoom: params.get("zoom") });
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsed.success || !parsedSlug.success) return { ok: false, code: "invalid_query" };
  const { bbox, zoom } = parsed.data;
  if (countClusterCells(cellRangeForBbox(bbox), clusterFactorForZoom(zoom)) > MAX_CELLS) {
    return { ok: false, code: "bbox_too_large" };
  }
  return { ok: true, data: { slug: parsedSlug.data, bbox, zoom } };
}
