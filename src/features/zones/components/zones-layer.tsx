"use client";

import { AdvancedMarker, Polygon, useAdvancedMarkerRef, useMap } from "@vis.gl/react-google-maps";
import { CircleDot, PenLine, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState, useTransition } from "react";

import { MapControl, useMapTapMode } from "@/features/map/components/map-controls";
import { useRouter } from "@/shared/i18n/navigation";
import { useTokenColors } from "@/shared/maps/theme-colors";
import {
  Button,
  ButtonGroup,
  Field,
  FormError,
  GlassPanel,
  IconButton,
  Input,
  MapMarker,
  SegmentedControl,
} from "@/shared/ui";

import type { ZoneKind } from "../schemas";
import { createZoneAction, removeZoneAction } from "../server/actions";
import type { MapZone } from "../server/zones";

// Zones reuse the traffic light: red keeps people out, orange asks for care, green gathers them.
const TOKENS = ["status-urgent", "status-pending", "status-done"] as const;
const KIND_TOKEN = {
  no_entry: "status-urgent",
  restricted: "status-pending",
  meeting_point: "status-done",
} as const satisfies Record<ZoneKind, (typeof TOKENS)[number]>;
const KIND_TONE = { no_entry: "urgent", restricted: "pending", meeting_point: "done" } as const;
const KINDS: ZoneKind[] = ["no_entry", "restricted", "meeting_point"];

// A corner while drawing. The id keeps its marker mounted while it is dragged.
type Corner = { id: string; lng: number; lat: number };
const corner = (lng: number, lat: number): Corner => ({ id: crypto.randomUUID(), lng, lat });

/**
 * One handle on the perimeter being drawn: a tap or a right click runs `onPick`, and a corner can
 * be dragged. Google's marker element sits above its content and takes the events, so the right
 * click is listened to on it, not on the dot.
 */
function Handle({
  position,
  label,
  draggable = false,
  onPick,
  onMove,
  children,
}: {
  position: google.maps.LatLngLiteral;
  label: string;
  draggable?: boolean;
  onPick: () => void;
  onMove?: (to: google.maps.LatLngLiteral) => void;
  children: ReactNode;
}) {
  const [ref, marker] = useAdvancedMarkerRef();
  useEffect(() => {
    if (!marker) return;
    const pick = (event: Event) => {
      event.preventDefault();
      onPick();
    };
    marker.addEventListener("contextmenu", pick);
    return () => marker.removeEventListener("contextmenu", pick);
  }, [marker, onPick]);
  return (
    <AdvancedMarker
      ref={ref}
      position={position}
      title={label}
      anchorLeft="-50%"
      anchorTop="-50%"
      draggable={draggable}
      onClick={onPick}
      onDragEnd={(event) => {
        const at = event.latLng;
        if (at && onMove) onMove({ lat: at.lat(), lng: at.lng() });
      }}
    >
      {children}
    </AdvancedMarker>
  );
}

/**
 * Drawn zones over the map, colored by kind, and for coordinators the tool to draw one by tapping
 * its corners. Lives inside the map; the server decides who may save (createZoneAction).
 */
export function ZonesLayer({ slug, zones, canDraw }: { slug: string; zones: MapZone[]; canDraw: boolean }) {
  const t = useTranslations("zones");
  const colors = useTokenColors(TOKENS);
  const map = useMap();
  const router = useRouter();
  const [selected, setSelected] = useState<MapZone | null>(null);
  // Shared with the other map layers, so a tap is a zone corner only while no one else listens.
  const [mode, setMode] = useMapTapMode();
  const drawing = mode === "drawing_zone";
  // One id per drawing, so retrying a save whose answer got lost cannot draw the zone twice.
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [points, setPoints] = useState<Corner[]>([]);
  const [kind, setKind] = useState<ZoneKind>("no_entry");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // While drawing, every tap on the map is a corner of the perimeter.
  useEffect(() => {
    if (!map || !drawing) return;
    const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      const at = event.latLng;
      if (at) setPoints((current) => [...current, corner(at.lng(), at.lat())]);
    });
    // A crosshair says the next click places a corner; back to the arrow when drawing ends.
    map.setOptions({ draggableCursor: "crosshair" });
    return () => {
      listener.remove();
      map.setOptions({ draggableCursor: "default" });
    };
  }, [map, drawing]);

  function stopDrawing() {
    setMode("idle");
    setZoneId(null);
    setPoints([]);
    setNote("");
    setError(null);
  }

  function save() {
    startTransition(async () => {
      const result = await createZoneAction({
        id: zoneId ?? crypto.randomUUID(),
        slug,
        kind,
        note: note.trim() || null,
        ring: points.map(({ lng, lat }) => [lng, lat]),
      });
      if (!result.ok) {
        setError(t(`errors.${result.code}`));
        return;
      }
      stopDrawing();
      router.refresh();
    });
  }

  function remove(zone: MapZone) {
    startTransition(async () => {
      const result = await removeZoneAction({ id: zone.id, slug });
      if (!result.ok) {
        setError(t(`errors.${result.code}`));
        return;
      }
      setSelected(null);
      router.refresh();
    });
  }

  const toPath = (ring: [number, number][]) => ring.map(([lng, lat]) => ({ lat, lng }));
  const removeCorner = (id: string) => setPoints((current) => current.filter((point) => point.id !== id));
  const moveCorner = (id: string, to: google.maps.LatLngLiteral) =>
    setPoints((current) => current.map((point) => (point.id === id ? { ...point, ...to } : point)));
  // Between every two corners (and back to the first once it is an area), a handle adds a corner.
  const edges = points.length > 2 ? points.length : points.length - 1;
  const midpoints = Array.from({ length: Math.max(edges, 0) }, (_, index) => {
    const from = points[index]!;
    const to = points[(index + 1) % points.length]!;
    return { index, lng: (from.lng + to.lng) / 2, lat: (from.lat + to.lat) / 2 };
  });

  return (
    <>
      {zones.map((zone) => {
        const color = colors[KIND_TOKEN[zone.kind]];
        return (
          <Polygon
            key={zone.id}
            paths={zone.polygons.flatMap((rings) => rings.map(toPath))}
            clickable={mode === "idle"}
            onClick={() => setSelected(zone)}
            fillColor={color}
            fillOpacity={0.18}
            strokeColor={color}
            strokeOpacity={0.95}
            strokeWeight={3}
          />
        );
      })}
      {/* Each corner is a visible dot: tap or right click removes it, dragging moves it. */}
      {drawing
        ? points.map((point) => (
            <Handle
              key={point.id}
              position={{ lat: point.lat, lng: point.lng }}
              label={t("removePoint")}
              draggable
              onPick={() => removeCorner(point.id)}
              onMove={(to) => moveCorner(point.id, to)}
            >
              <MapMarker tone={KIND_TONE[kind]} icon={<CircleDot />} />
            </Handle>
          ))
        : null}
      {drawing
        ? midpoints.map((mid) => (
            <Handle
              key={`${points[mid.index]!.id}-mid`}
              position={{ lat: mid.lat, lng: mid.lng }}
              label={t("addPoint")}
              onPick={() =>
                setPoints((current) => [
                  ...current.slice(0, mid.index + 1),
                  corner(mid.lng, mid.lat),
                  ...current.slice(mid.index + 1),
                ])
              }
            >
              <MapMarker tone="closed" size="handle" icon={<Plus />} />
            </Handle>
          ))
        : null}
      {drawing && points.length > 2 ? (
        <Polygon
          paths={points.map(({ lng, lat }) => ({ lat, lng }))}
          clickable={false}
          fillColor={colors[KIND_TOKEN[kind]]}
          fillOpacity={0.12}
          strokeColor={colors[KIND_TOKEN[kind]]}
          strokeOpacity={0.95}
          strokeWeight={3}
        />
      ) : null}

      <MapControl slot="zones">
        {selected && !drawing ? (
          <GlassPanel className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-body-sm font-medium text-ink">{t(`kinds.${selected.kind}`)}</p>
              <IconButton variant="ghost" label={t("close")} onClick={() => setSelected(null)}>
                <X />
              </IconButton>
            </div>
            {selected.note ? <p className="text-body-sm text-ink-soft">{selected.note}</p> : null}
            {canDraw ? (
              <Button variant="secondary" disabled={pending} onClick={() => remove(selected)}>
                {t("remove")}
              </Button>
            ) : null}
            {error ? <FormError>{error}</FormError> : null}
          </GlassPanel>
        ) : null}

        {canDraw && mode === "idle" && !selected ? (
          <Button
            variant="secondary"
            onClick={() => {
              setZoneId(crypto.randomUUID());
              setMode("drawing_zone");
            }}
          >
            <PenLine aria-hidden />
            {t("draw")}
          </Button>
        ) : null}

        {drawing ? (
          <GlassPanel className="flex flex-col gap-3 p-4">
            <p className="text-body-sm text-ink">{t("drawHint", { count: points.length })}</p>
            <SegmentedControl
              label={t("kindLabel")}
              value={kind}
              onChange={setKind}
              options={KINDS.map((value) => ({ value, label: t(`kinds.${value}`) }))}
            />
            <Field id="zone-note" label={t("noteLabel")}>
              <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} />
            </Field>
            <ButtonGroup label={t("toolbar")}>
              <Button
                variant="ghost"
                disabled={points.length === 0 || pending}
                onClick={() => setPoints((current) => current.slice(0, -1))}
              >
                {t("undo")}
              </Button>
              <Button variant="ghost" disabled={pending} onClick={stopDrawing}>
                {t("cancel")}
              </Button>
              <Button variant="primary" disabled={points.length < 3 || pending} onClick={save}>
                {t("save")}
              </Button>
            </ButtonGroup>
            {error ? <FormError>{error}</FormError> : null}
          </GlassPanel>
        ) : null}
      </MapControl>
    </>
  );
}
