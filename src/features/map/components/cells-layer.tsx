"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Clock, ZoomIn } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Button, Chip, GlassPanel, MapMarker, SegmentedControl } from "@/shared/ui";

import { LEVEL_ICON, LEVEL_TONE, mostUrgentLevel } from "../attention";
import { FIT_PADDING } from "../grid";
import type { MapCell } from "../server/map-cells";
import type { AreaPolygon } from "../server/map-emergency";
import { fetchCells, MapCellsError, REFRESH_MS, type Viewport } from "./fetch-cells";
import { MapLegend } from "./map-legend";
import { useOpenCell } from "./map-shell";
import { ZonesLayer } from "./zones-layer";

type Mode = "homes" | "zones";

/**
 * What is drawn over the map for the viewport: homes as markers, or zones as a heat map of cells,
 * with the view switch and the time of the last read on top. Refreshes itself every minute.
 */
export function CellsLayer({
  slug,
  viewport,
  area,
  paused = false,
}: {
  slug: string;
  viewport: Viewport;
  area: AreaPolygon[] | null;
  /** True while the list fallback covers the map: no point refreshing what nobody sees. */
  paused?: boolean;
}) {
  const t = useTranslations("map");
  const format = useFormatter();
  const map = useMap();
  const router = useRouter();
  const { id: selectedId } = useParams<{ id?: string }>();
  const { setOpenCell } = useOpenCell();
  const [mode, setMode] = useState<Mode>("homes");
  const query = useQuery({
    queryKey: ["map-cells", slug, viewport],
    queryFn: ({ signal }) => fetchCells(slug, viewport, signal),
    placeholderData: keepPreviousData,
    refetchInterval: paused ? false : REFRESH_MS,
  });
  const cells = query.data?.cells ?? [];
  const errorCode = query.error instanceof MapCellsError ? query.error.code : null;

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
      {mode === "zones" ? (
        <ZonesLayer cells={cells} zoom={query.data?.zoom ?? viewport.zoom} area={area} onOpen={open} />
      ) : (
        cells.map((cell) => {
          const level = mostUrgentLevel(cell.levels);
          const Icon = LEVEL_ICON[level];
          const single = cell.count === 1;
          const selected = single && cell.worksites?.[0]?.id === selectedId;
          return (
            <AdvancedMarker
              key={`${cell.bounds.west},${cell.bounds.south}`}
              position={cell.position}
              anchorLeft="-50%"
              anchorTop="-50%"
              zIndex={selected ? 1 : 0}
              title={
                single
                  ? t("marker.home", { level: t(`levels.${level}`) })
                  : t("marker.group", {
                      count: cell.count,
                      doNotEnter: cell.levels.do_not_enter,
                      unattended: cell.levels.unattended,
                      unconfirmed: cell.levels.unconfirmed,
                      noRequest: cell.levels.no_request,
                      inProgress: cell.levels.in_progress,
                      attended: cell.levels.attended,
                    })
              }
              onClick={() => open(cell)}
            >
              <MapMarker
                tone={LEVEL_TONE[level]}
                icon={<Icon />}
                count={single ? undefined : cell.count}
                selected={selected}
              />
            </AdvancedMarker>
          );
        })
      )}
      <div className="absolute inset-x-4 top-4 flex flex-col items-center gap-2 md:start-auto md:items-end">
        <SegmentedControl
          label={t("modeLabel")}
          value={mode}
          onChange={setMode}
          options={[
            { value: "homes", label: t("modeHomes") },
            { value: "zones", label: t("modeZones") },
          ]}
        />
        {mode === "zones" ? (
          <GlassPanel className="flex max-w-narrow flex-col gap-2 p-4">
            <MapLegend />
            <p className="text-caption text-ink-soft">{t("zonesHint")}</p>
          </GlassPanel>
        ) : null}
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
            {t("updatedAt", { time: format.dateTime(query.dataUpdatedAt, { timeStyle: "short" }) })}
          </Chip>
        ) : null}
      </div>
    </>
  );
}
