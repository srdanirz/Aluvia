/**
 * The map's grouping grid. Groups are built from whole cells, a power of two of them per zoom, so
 * groups nest as the map zooms and a group never splits a block in two.
 */

// ~110 m north-south and ~90 m east-west at Santiago's latitude: about one city block.
export const CELL_DEGREES = 0.001;

// A cluster cell spans at least ~100 px on screen (256 px tiles): a group pill with a three-digit
// count is ~70 px wide, and at 64 px neighboring groups overlapped on a phone.
const CLUSTER_TILE_FRACTION = 2.5;

// Enough for a 2560 px wide screen at 100 px per cell with room to spare, and small enough that
// a scripted client asking for the whole country at street zoom gets a 422 instead of a scan.
export const MAX_CELLS = 2500;

// Room around an area the map fits, so its edge does not sit under a floating panel.
export const FIT_PADDING = 64;

export const MIN_ZOOM = 0;
export const MAX_ZOOM = 22;

export type Bbox = { west: number; south: number; east: number; north: number };

/** Cell index range covering the bbox: whole grid cells, inclusive. */
export type CellRange = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Cluster cell size at a zoom, in grid cells. A power of two, so cluster cells nest exactly on
 * the grid; 1 means street zoom, where groups are single cells.
 */
export function clusterFactorForZoom(zoom: number): number {
  const degrees = 360 / 2 ** zoom / CLUSTER_TILE_FRACTION;
  return 2 ** Math.max(0, Math.ceil(Math.log2(degrees / CELL_DEGREES)));
}

/** The grid cells a bbox touches. Rounded outward, so a bbox never cuts a cell in half. */
export function cellRangeForBbox({ west, south, east, north }: Bbox): CellRange {
  return {
    minX: Math.floor(west / CELL_DEGREES),
    minY: Math.floor(south / CELL_DEGREES),
    maxX: Math.ceil(east / CELL_DEGREES) - 1,
    maxY: Math.ceil(north / CELL_DEGREES) - 1,
  };
}

/**
 * How many cluster cells the response can hold at most; the endpoint rejects more than MAX_CELLS.
 */
export function countClusterCells(range: CellRange, factor: number): number {
  const columns = Math.floor(range.maxX / factor) - Math.floor(range.minX / factor) + 1;
  const rows = Math.floor(range.maxY / factor) - Math.floor(range.minY / factor) + 1;
  return columns * rows;
}

/**
 * Widens a bbox outward to whole cluster cells of its zoom, so small pans ask for the same URL
 * (HTTP cache) and the server never cuts a group.
 */
export function snapBbox(bbox: Bbox, zoom: number): Bbox {
  const size = clusterFactorForZoom(zoom) * CELL_DEGREES;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    west: clamp(Math.floor(bbox.west / size) * size, -180, 180),
    south: clamp(Math.floor(bbox.south / size) * size, -90, 90),
    east: clamp(Math.ceil(bbox.east / size) * size, -180, 180),
    north: clamp(Math.ceil(bbox.north / size) * size, -90, 90),
  };
}

/**
 * The closest zoom at which a whole bbox fits in at most `maxGroups` groups: how the list view
 * splits an emergency into zones when there is no map to zoom.
 */
export function zoomToFit(bbox: Bbox, maxGroups: number): number {
  const range = cellRangeForBbox(bbox);
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom -= 1) {
    if (countClusterCells(range, clusterFactorForZoom(zoom)) <= maxGroups) return zoom;
  }
  return MIN_ZOOM;
}
