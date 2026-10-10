"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Clock, ZoomIn } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { useRouter } from "@/shared/i18n/navigation";
import { Button, Chip, GlassPanel, MapMarker } from "@/shared/ui";

import { countByState, LEVEL_STATE, mostUrgentLevel, STATE_ICON, STATE_TONE } from "../attention";
import { FIT_PADDING } from "../grid";
import { mergeOverlappingCells } from "../merge-cells";
import type { MapCell } from "../server/map-cells";
import type { AreaPolygon } from "../server/map-emergency";
import { fetchCells, MapCellsError, REFRESH_MS, type Viewport } from "./fetch-cells";
import { AreaOutline } from "./area-outline";
import { useOpenCell } from "./map-shell";

const PIN_PIXELS = 72;

/**
 * What is drawn over the map for the viewport: the affected area and its homes as markers, with
 * the time of the last read on top. Refreshes itself every minute.
 */
export function CellsLayer({
  slug,
  viewport,
  area,
  timeZone,
  paused = false,
}: {
  slug: string;
  viewport: Viewport;
  area: AreaPolygon[] | null;
  /** The emergency's zone: "updated at" is local time there, not the device's or the server's. */
  timeZone: string;
  /** True while the list fallback covers the map: no point refreshing what nobody sees. */
  paused?: boolean;
}) {
  const t = useTranslations("map");
  const format = useFormatter();
  const map = useMap();
  const router = useRouter();
  const { id: selectedId } = useParams<{ id?: string }>();
  const { setOpenCell } = useOpenCell();
  const query = useQuery({
    queryKey: ["map-cells", slug, viewport],
    queryFn: ({ signal }) => fetchCells(slug, viewport, signal),
    placeholderData: keepPreviousData,
    refetchInterval: paused ? false : REFRESH_MS,
  });
  const zoom = query.data?.zoom ?? viewport.zoom;
  // A pin is ~70 px wide with a three-digit count; closer than that, two groups read as one.
  const cells = mergeOverlappingCells(query.data?.cells ?? [], zoom, PIN_PIXELS);
  const errorCode = query.error instanceof MapCellsError ? query.error.code : null;

  function groupLabel(cell: MapCell) {
    const states = countByState(cell.levels);
    return t("marker.group", {
      count: cell.count,
      needsHelp: states.needs_help,
      onTheWay: states.on_the_way,
      attended: states.attended,
      doNotEnter: states.do_not_enter,
    });
  }

  function open(cell: MapCell) {
    const homes = cell.worksites;
    if (homes && homes.length > 1) {
      setOpenCell(cell);
      return;
    }
    // Anything else replaces the panel, so a block list left open must not cover it.
    setOpenCell(null);
    if (homes?.[0]) router.push(`/emergencies/${slug}/worksites/${homes[0].id}`);
    else map?.fitBounds(cell.bounds, FIT_PADDING);
  }

  return (
    <>
      <AreaOutline area={area} />
      {cells.map((cell) => {
        const state = LEVEL_STATE[mostUrgentLevel(cell.levels)];
        const Icon = STATE_ICON[state];
        const single = cell.count === 1;
        const selected = single && cell.worksites?.[0]?.id === selectedId;
        return (
          <AdvancedMarker
            key={cell.key}
            position={cell.position}
            anchorLeft="-50%"
            anchorTop="-50%"
            zIndex={selected ? 1 : 0}
            title={single ? t("marker.home", { state: t(`states.${state}`) }) : groupLabel(cell)}
            onClick={() => open(cell)}
          >
            <MapMarker
              tone={STATE_TONE[state]}
              shape={state === "do_not_enter" ? "sign" : "pill"}
              icon={<Icon />}
              count={single ? undefined : cell.count}
              selected={selected}
            />
          </AdvancedMarker>
        );
      })}
      <div className="absolute inset-x-4 top-4 flex flex-col items-center gap-2 md:start-auto md:items-end">
        {query.isError ? (
          <GlassPanel className="flex items-center gap-4 p-4">
            <p role="alert" className="text-body-sm text-ink">
              {errorCode ? t(`errors.${errorCode}`) : t("loadError")}
            </p>
            {errorCode ? null : (
              <Button variant="secondary" onClick={() => void query.refetch()}>
                {t("retry")}
              </Button>
            )}
          </GlassPanel>
        ) : query.data?.truncated ? (
          <Chip icon={<ZoomIn />}>{t("truncated")}</Chip>
        ) : query.dataUpdatedAt > 0 ? (
          <Chip icon={<Clock />}>
            {t("updatedAt", { time: format.dateTime(query.dataUpdatedAt, { timeStyle: "short", timeZone }) })}
          </Chip>
        ) : null}
      </div>
    </>
  );
}
