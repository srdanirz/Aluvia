"use client";

import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps";
import { Package, PackagePlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { MapControl, useMapTapMode } from "@/features/map/components/map-controls";
import { useRouter } from "@/shared/i18n/navigation";
import { Button, MapMarker } from "@/shared/ui";

import type { MapCollectionPoints } from "../server/collection-points";
import { CollectionPointForm } from "./collection-point-form";
import { CollectionPointPanel } from "./collection-point-panel";

type Position = { lng: number; lat: number };

/**
 * Donation collection points over the map, and for coordinators the tool to add one by tapping its
 * place. Lives inside the map; the server decides who may save (createCollectionPointAction).
 */
export function CollectionPointsLayer({
  slug,
  data,
  canEdit,
}: {
  slug: string;
  data: MapCollectionPoints;
  canEdit: boolean;
}) {
  const t = useTranslations("collectionPoints");
  const map = useMap();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The id of the point being added, fixed until it is saved or cancelled.
  const [newId, setNewId] = useState<string | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  // Shared with the other map layers, so a tap places the point only while no one else listens.
  const [mode, setMode] = useMapTapMode();
  const adding = mode === "adding_point" && newId !== null;
  const selected = data.points.find((point) => point.id === selectedId) ?? null;

  // While adding, a tap on the map places (or moves) the new point.
  useEffect(() => {
    if (!map || !adding) return;
    const listener = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      const at = event.latLng;
      if (at) setPosition({ lng: at.lng(), lat: at.lat() });
    });
    return () => listener.remove();
  }, [map, adding]);

  function startAdding() {
    setSelectedId(null);
    setNewId(crypto.randomUUID());
    setMode("adding_point");
  }

  function stopAdding() {
    setNewId(null);
    setPosition(null);
    setMode("idle");
  }

  return (
    <>
      {data.points.map((point) => (
        <AdvancedMarker
          key={point.id}
          position={{ lat: point.lat, lng: point.lng }}
          anchorLeft="-50%"
          anchorTop="-50%"
          zIndex={point.id === selectedId ? 2 : 1}
          title={t("marker", { name: point.name, status: t(`statuses.${point.status}`) })}
          clickable={mode === "idle"}
          onClick={() => setSelectedId(point.id)}
        >
          <MapMarker tone="place" icon={<Package />} selected={point.id === selectedId} />
        </AdvancedMarker>
      ))}
      {adding && position ? (
        <AdvancedMarker position={position} anchorLeft="-50%" anchorTop="-50%" zIndex={2}>
          <MapMarker tone="place" icon={<PackagePlus />} selected />
        </AdvancedMarker>
      ) : null}

      <MapControl slot="collectionPoints">
        {selected && !adding ? (
          <CollectionPointPanel
            key={selected.id}
            slug={slug}
            point={selected}
            supplyTypes={data.supplyTypes}
            canEdit={canEdit}
            onClose={() => setSelectedId(null)}
            onChanged={() => router.refresh()}
          />
        ) : null}

        {canEdit && mode === "idle" && !selected ? (
          <Button variant="secondary" onClick={startAdding}>
            <PackagePlus aria-hidden />
            {t("add")}
          </Button>
        ) : null}

        {adding && newId ? (
          <CollectionPointForm
            key={newId}
            id={newId}
            slug={slug}
            position={position}
            supplyTypes={data.supplyTypes}
            onCancel={stopAdding}
            onSaved={() => {
              stopAdding();
              router.refresh();
            }}
          />
        ) : null}
      </MapControl>
    </>
  );
}
