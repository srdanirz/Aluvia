"use client";

import { Polygon, Rectangle } from "@vis.gl/react-google-maps";

import { useTokenColors } from "@/shared/maps/theme-colors";

import { ATTENTION_LEVELS } from "../attention";
import { CELL_DEGREES, clusterFactorForZoom } from "../grid";
import type { AreaPolygon } from "../server/map-emergency";
import type { MapCell } from "../server/map-cells";

const TOKENS = ["status-urgent", "status-closed", "status-pending", "status-done", "rain-600"] as const;

// Fill opacity of a zone runs from a faint wash to a strong one with how many homes in it wait
// with nobody on them, relative to the busiest zone on screen. Below the floor a zone would vanish
// against the map; above the ceiling the streets under it stop being readable.
const NEED_OPACITY_MIN = 0.25;
const NEED_OPACITY_MAX = 0.65;
const QUIET_OPACITY = 0.2;

type Zone = { west: number; south: number; levels: MapCell["levels"]; cell: MapCell };

/**
 * One square per grouping cell. At street zoom the server sends each home alone, so homes of the
 * same block are summed here; the zone opens like the block's first home would.
 */
function toZones(cells: MapCell[], size: number): Zone[] {
  const zones = new Map<string, Zone>();
  for (const cell of cells) {
    const west = Math.floor(cell.position.lng / size) * size;
    const south = Math.floor(cell.position.lat / size) * size;
    const key = `${west},${south}`;
    const zone = zones.get(key);
    if (!zone) {
      zones.set(key, { west, south, levels: { ...cell.levels }, cell });
      continue;
    }
    for (const level of ATTENTION_LEVELS) zone.levels[level] += cell.levels[level];
    zone.cell = {
      ...zone.cell,
      count: zone.cell.count + cell.count,
      worksites: [...(zone.cell.worksites ?? []), ...(cell.worksites ?? [])].sort(
        (a, b) => ATTENTION_LEVELS.indexOf(a.level) - ATTENTION_LEVELS.indexOf(b.level),
      ),
    };
  }
  return [...zones.values()];
}

/**
 * The "zones" view: the official affected area and each cluster cell painted by need, a heat map
 * made of whole cells. Zones with homes waiting are earth, darker where more wait; the rest take
 * their most urgent level's color.
 */
export function ZonesLayer({
  cells,
  zoom,
  area,
  onOpen,
}: {
  cells: MapCell[];
  zoom: number;
  area: AreaPolygon[] | null;
  /** A tapped zone opens like a marker: zoom in, or list its homes. */
  onOpen: (cell: MapCell) => void;
}) {
  const colors = useTokenColors(TOKENS);
  const size = clusterFactorForZoom(zoom) * CELL_DEGREES;
  const zones = toZones(cells, size);
  const maxWaiting = Math.max(1, ...zones.map((zone) => zone.levels.do_not_enter + zone.levels.unattended));

  return (
    <>
      {area?.map((rings, index) => (
        <Polygon
          key={index}
          paths={rings}
          clickable={false}
          fillColor={colors["rain-600"]}
          fillOpacity={0.08}
          strokeColor={colors["rain-600"]}
          strokeOpacity={0.9}
          strokeWeight={2}
        />
      ))}
      {zones.map(({ west, south, levels, cell }) => {
        // Same order as the markers (mostUrgentLevel), but only waiting homes darken a zone:
        // "to confirm" and "no request" are not urgent (ADR 0011).
        const waiting = levels.do_not_enter + levels.unattended;
        const color =
          waiting > 0
            ? colors["status-urgent"]
            : levels.unconfirmed + levels.no_request > 0
              ? colors["status-closed"]
              : levels.in_progress > 0
                ? colors["status-pending"]
                : colors["status-done"];
        const opacity =
          waiting > 0
            ? NEED_OPACITY_MIN + (NEED_OPACITY_MAX - NEED_OPACITY_MIN) * (waiting / maxWaiting)
            : QUIET_OPACITY;
        return (
          <Rectangle
            key={`${west},${south}`}
            bounds={{ west, south, east: west + size, north: south + size }}
            onClick={() => onOpen(cell)}
            fillColor={color}
            fillOpacity={opacity}
            strokeWeight={0}
          />
        );
      })}
    </>
  );
}
