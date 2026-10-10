import { ATTENTION_LEVELS } from "./attention";
import type { MapCell } from "./server/map-cells";

/** A group on screen; `key` is its largest source cell, so a pin keeps its identity while smaller
 * groups fold into it as the map moves. */
export type ScreenCell = MapCell & { key: string };

const cellKey = (cell: MapCell) => `${cell.bounds.west},${cell.bounds.south}`;

/**
 * Merges groups whose pins would overlap on screen at `zoom`. The server groups by grid cells, but
 * each pin sits at the mean of its homes, so two neighboring cells can land a few pixels apart and
 * hide each other. Merged groups keep every count and zoom in when tapped (no home list).
 */
export function mergeOverlappingCells(
  cells: readonly MapCell[],
  zoom: number,
  minPixels: number,
): ScreenCell[] {
  // Web Mercator: 256 px per world tile at zoom 0.
  const scale = 256 * 2 ** zoom;
  const toPixels = ({ lat, lng }: MapCell["position"]) => {
    const sin = Math.sin((lat * Math.PI) / 180);
    return {
      x: ((lng + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  };

  // Largest groups first, so the big pins stay put and small ones fold into them.
  const ordered = [...cells].sort((a, b) => b.count - a.count);
  const groups: { cell: MapCell; key: string; px: { x: number; y: number } }[] = [];
  for (const cell of ordered) {
    const px = toPixels(cell.position);
    const target = groups.find(
      (group) => Math.abs(group.px.x - px.x) < minPixels && Math.abs(group.px.y - px.y) < minPixels,
    );
    if (!target) {
      groups.push({ cell, key: cellKey(cell), px });
      continue;
    }
    target.cell = mergeTwo(target.cell, cell);
    target.px = toPixels(target.cell.position);
  }
  return groups.map(({ cell, key }) => ({ ...cell, key }));
}

function mergeTwo(a: MapCell, b: MapCell): MapCell {
  const count = a.count + b.count;
  const levels = Object.fromEntries(
    ATTENTION_LEVELS.map((level) => [level, a.levels[level] + b.levels[level]]),
  ) as MapCell["levels"];
  return {
    position: {
      lat: (a.position.lat * a.count + b.position.lat * b.count) / count,
      lng: (a.position.lng * a.count + b.position.lng * b.count) / count,
    },
    count,
    levels,
    worksites: null,
    bounds: {
      west: Math.min(a.bounds.west, b.bounds.west),
      south: Math.min(a.bounds.south, b.bounds.south),
      east: Math.max(a.bounds.east, b.bounds.east),
      north: Math.max(a.bounds.north, b.bounds.north),
    },
  };
}
