import type { Bbox } from "../grid";
import type { MapCell } from "../server/map-cells";

// Coverage changes while a volunteer is on the way; a minute keeps the map fresh without
// hammering the endpoint during a WhatsApp burst (the edge cache absorbs the rest).
export const REFRESH_MS = 60_000;

export type Viewport = { bbox: Bbox; zoom: number };
/** Cells with the zoom they were grouped for: while a new zoom loads, the old cells keep theirs. */
export type CellsAtZoom = { zoom: number; cells: MapCell[]; truncated: boolean };

const ERROR_CODES = ["bbox_too_large", "emergency_not_found"] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

export class MapCellsError extends Error {
  constructor(readonly code: ErrorCode | null) {
    super(`map cells: ${code ?? "failed"}`);
  }
}

/** Reads the map cells endpoint; a known error code survives as MapCellsError.code. */
export async function fetchCells(
  slug: string,
  { bbox, zoom }: Viewport,
  signal: AbortSignal,
): Promise<CellsAtZoom> {
  const params = new URLSearchParams({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north].map((n) => n.toFixed(6)).join(","),
    zoom: String(zoom),
  });
  const response = await fetch(`/api/v1/emergencies/${encodeURIComponent(slug)}/worksites?${params}`, {
    signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { code?: string } | null;
    const code = ERROR_CODES.find((known) => known === body?.code) ?? null;
    throw new MapCellsError(code);
  }
  const body = (await response.json()) as { items: MapCell[]; truncated: boolean };
  return { zoom, cells: body.items, truncated: body.truncated };
}
