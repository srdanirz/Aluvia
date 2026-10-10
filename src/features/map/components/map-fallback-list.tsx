"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { track } from "@/shared/analytics/client";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, Chip } from "@/shared/ui";

import { ATTENTION_LEVELS, type AttentionLevel, LEVEL_ICON, LEVEL_TONE, levelRank } from "../attention";
import { type Bbox, CELL_DEGREES, snapBbox, zoomToFit } from "../grid";
import type { MapCell } from "../server/map-cells";
import { fetchCells, REFRESH_MS } from "./fetch-cells";

/** `zone=west,south,east,north` from the URL, or null when absent or malformed. */
function parseZone(value: string | null): Bbox | null {
  const parts = value?.split(",").map(Number);
  if (!parts || parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [west = 0, south = 0, east = 0, north = 0] = parts;
  return west < east && south < north ? { west, south, east, north } : null;
}

type Home = { id: string; level: AttentionLevel };
/** A list row: one home, or a zone to open (`home` null). */
type Row = { key: string; position: number; home: Home | null; cell: MapCell };

/**
 * Most urgent first. A group whose homes all came listed (one home, or several on one point) shows
 * them as homes; zooming into it would find the same group again.
 */
/** A group inside one grid cell (a block): zooming cannot split it further. */
function inOneBlock(cell: MapCell): boolean {
  const { west, east } = cell.bounds;
  return east - west <= CELL_DEGREES * 1.0001;
}

function toRows(cells: MapCell[]): Row[] {
  const sorted = [...cells].sort((a, b) => levelRank(a.levels) - levelRank(b.levels) || b.count - a.count);
  return sorted
    .flatMap((cell): Omit<Row, "position">[] =>
      // A full list, or one block holding more homes than a group lists.
      cell.worksites && (cell.worksites.length === cell.count || inOneBlock(cell))
        ? cell.worksites.map((home) => ({ key: home.id, home, cell }))
        : [{ key: `${cell.bounds.west},${cell.bounds.south}`, home: null, cell }],
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
}

// Zones a phone can scan in one scroll; more would be a list nobody reads.
const MAX_ZONES = 40;
const WORLD = { west: -180, south: -85, east: 180, north: 85 };

/**
 * The map without Google Maps (no key, quota spent, no signal): the same groups as a list (ADR
 * 0006). Most homes waiting first; a zone opens into smaller zones until each row is a home that
 * links to its page. Reads the same endpoint as the map, so it shows exactly what the map would.
 */
export function MapFallbackList({
  slug,
  bounds,
  reason,
}: {
  slug: string;
  bounds: Bbox | null;
  /** Why there is no map: no usable key or script, or no tiles in time (quota, signal). */
  reason: "unavailable" | "no_tiles";
}) {
  useEffect(() => track("map_fallback_shown", { reason }), [reason]);
  const t = useTranslations("map");
  // The open zone lives in the URL, so the phone's back button closes it and the link can be
  // shared.
  const zone = parseZone(useSearchParams().get("zone"));
  const area = zone ?? bounds ?? WORLD;
  // Zones split again until each row is one home, however large the emergency is.
  const zoom = zoomToFit(area, MAX_ZONES);
  const viewport = { zoom, bbox: snapBbox(area, zoom) };
  const query = useQuery({
    queryKey: ["map-cells", slug, viewport],
    queryFn: ({ signal }) => fetchCells(slug, viewport, signal),
    refetchInterval: REFRESH_MS,
  });
  const rows = toRows(query.data?.cells ?? []);
  const hiddenHomes = (query.data?.cells ?? []).reduce(
    (sum, cell) => sum + (cell.worksites && inOneBlock(cell) ? cell.count - cell.worksites.length : 0),
    0,
  );

  return (
    <div className="flex size-full flex-col items-center overflow-y-auto bg-canvas px-4 pt-16 pb-sheet md:ps-panel">
      <div className="flex w-full max-w-narrow flex-col gap-4 md:ms-8">
        <div role="status" className="flex items-center gap-3">
          <MapPinOff aria-hidden className="size-icon shrink-0 text-ink-muted" strokeWidth={1.5} />
          <div className="flex flex-col">
            <p className="text-body font-medium text-ink">{t("unavailable.title")}</p>
            <p className="text-body-sm text-ink-soft">{t("unavailable.body")}</p>
          </div>
        </div>
        {zone ? (
          <Button variant="secondary" className="self-start" asChild>
            <Link href={`/emergencies/${slug}`}>{t("fallback.back")}</Link>
          </Button>
        ) : null}
        {query.isError ? (
          <p role="alert" className="text-body-sm text-ink">
            {t("loadError")}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key}>
              {row.home ? (
                <HomeRow home={row.home} slug={slug} position={row.position} />
              ) : (
                <ZoneRow cell={row.cell} slug={slug} position={row.position} />
              )}
            </li>
          ))}
        </ul>
        {hiddenHomes > 0 ? (
          <p className="text-body-sm text-ink-soft">{t("cell.more", { count: hiddenHomes })}</p>
        ) : null}
        {query.data?.truncated ? <p className="text-body-sm text-ink-soft">{t("truncated")}</p> : null}
      </div>
    </div>
  );
}

function LevelChips({ levels }: { levels: MapCell["levels"] }) {
  const t = useTranslations("map");
  return (
    <div className="flex flex-wrap gap-2">
      {ATTENTION_LEVELS.filter((level) => levels[level] > 0).map((level) => {
        const Icon = LEVEL_ICON[level];
        return (
          <Chip key={level} tone={LEVEL_TONE[level]} icon={<Icon />}>
            {t("fallback.levelCount", { count: levels[level], level: t(`levels.${level}`) })}
          </Chip>
        );
      })}
    </div>
  );
}

function ZoneRow({ cell, slug, position }: { cell: MapCell; slug: string; position: number }) {
  const t = useTranslations("map");
  const { west, south, east, north } = cell.bounds;
  const zone = [west, south, east, north].map((n) => n.toFixed(6)).join(",");
  return (
    <Card interactive size="compact" className="flex-row items-center justify-between gap-3" asChild>
      <Link href={`/emergencies/${slug}?zone=${zone}`}>
        <div className="flex flex-col gap-2">
          <span className="text-body font-medium text-ink">
            {t("fallback.zone", { position, count: cell.count })}
          </span>
          <LevelChips levels={cell.levels} />
        </div>
        <ChevronRight aria-hidden className="size-icon shrink-0 text-ink-muted" strokeWidth={1.5} />
      </Link>
    </Card>
  );
}

function HomeRow({ home, slug, position }: { home: Home; slug: string; position: number }) {
  const t = useTranslations("map");
  const Icon = LEVEL_ICON[home.level];
  return (
    <Card interactive size="compact" className="flex-row items-center justify-between gap-3" asChild>
      <Link href={`/emergencies/${slug}/worksites/${home.id}`}>
        <div className="flex flex-col gap-2">
          <span className="text-body font-medium text-ink">{t("cell.home", { position })}</span>
          <Chip tone={LEVEL_TONE[home.level]} icon={<Icon />}>
            {t(`levels.${home.level}`)}
          </Chip>
        </div>
        <ChevronRight aria-hidden className="size-icon shrink-0 text-ink-muted" strokeWidth={1.5} />
      </Link>
    </Card>
  );
}
