"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { ArrowLeft, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FocusWorksite } from "@/features/map/components/focus-worksite";
import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { useGoogleMapsStatus } from "@/shared/maps/google-maps-provider";
import {
  Button,
  Card,
  CardBody,
  Chip,
  FormError,
  GlassPanel,
  IconButton,
  MapMarker,
  Spinner,
} from "@/shared/ui";

import { placeWorksiteAction } from "../server/actions";
import type { PlacementTarget } from "../server/placement-screen";

type Nearby = { id: string; distanceMeters: number }[];
type Phase = { kind: "idle" } | { kind: "saving" } | { kind: "nearby"; nearby: Nearby } | { kind: "saved" };

/**
 * Issue #43: a coordinator puts or moves a home's pin. The pin stays fixed at the center of the
 * screen and the map moves under it, which works the same with a thumb, a mouse or a keyboard.
 * Another home within 15 m asks for confirmation first; the save carries the home's version, and a
 * stale one reloads the page, which remounts the panel with the current version (keyed by it).
 */
export function PlacementPanel({ slug, target }: { slug: string; target: PlacementTarget }) {
  const t = useTranslations("worksites.placement");
  const errorMessage = useErrorMessage();
  const status = useGoogleMapsStatus();
  const map = useMap();
  const router = useRouter();
  const [version, setVersion] = useState(target.version);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const queue = `/emergencies/${slug}/worksites/review`;

  const save = async (allowNearby: boolean) => {
    const center = map?.getCenter();
    if (!center) return;
    setPhase({ kind: "saving" });
    setError(null);
    try {
      const result = await placeWorksiteAction({
        slug,
        worksiteId: target.id,
        location: { lng: center.lng(), lat: center.lat() },
        version,
        allowNearby,
      });
      if (result.ok) {
        setVersion(result.version);
        return setPhase({ kind: "saved" });
      }
      if (result.code === "possible_duplicate") return setPhase({ kind: "nearby", nearby: result.nearby });
      setError(result.code);
    } catch {
      setError("network_error");
    }
    setPhase({ kind: "idle" });
  };

  return (
    <>
      {/* Outside the animated panel: a transformed ancestor would center it in the panel, not the map. */}
      {status === "ready" && phase.kind !== "saved" ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 flex items-center justify-center">
          <MapMarker tone="pending" icon={<MapPin />} />
        </div>
      ) : null}
      <GlassPanel className="flex min-h-0 animate-enter flex-col gap-6 overflow-y-auto">
        {target.location ? <FocusWorksite lat={target.location.lat} lng={target.location.lng} /> : null}

        <header className="flex items-start gap-3">
          <IconButton variant="ghost" label={t("back")} asChild>
            <Link href={queue}>
              <ArrowLeft aria-hidden />
            </Link>
          </IconButton>
          <div className="flex flex-col gap-2">
            <h1 className="text-heading-sm text-ink">{target.location ? t("moveTitle") : t("placeTitle")}</h1>
            <p className="text-body text-ink">{target.addressText ?? t("noAddress")}</p>
            {target.notes ? <CardBody>{target.notes}</CardBody> : null}
          </div>
        </header>

        {status === "unavailable" ? (
          <Card>
            <CardBody>{t("mapUnavailable")}</CardBody>
          </Card>
        ) : phase.kind === "saved" ? (
          <div className="flex flex-col gap-4">
            <Chip tone="done" className="self-start">
              {t("savedChip")}
            </Chip>
            <Button asChild block>
              <Link href={queue}>{t("backToQueue")}</Link>
            </Button>
          </div>
        ) : phase.kind === "nearby" ? (
          <div role="alert" className="flex flex-col gap-4">
            <Chip tone="pending" className="self-start">
              {t("nearbyChip")}
            </Chip>
            <p className="text-body-sm text-ink-soft">{t("nearbyBody", { count: phase.nearby.length })}</p>
            <ul className="flex flex-col gap-2">
              {phase.nearby.map((home) => (
                <li key={home.id}>
                  <Card inset className="flex-row items-center justify-between gap-3">
                    <span className="text-body-sm text-ink">
                      {t("distance", { meters: home.distanceMeters })}
                    </span>
                    <Button variant="ghost" asChild>
                      <Link href={`/emergencies/${slug}/worksites/${home.id}`}>{t("viewNearby")}</Link>
                    </Button>
                  </Card>
                </li>
              ))}
            </ul>
            <Button block onClick={() => void save(true)}>
              {t("saveAnyway")}
            </Button>
            <Button variant="ghost" block onClick={() => setPhase({ kind: "idle" })}>
              {t("keepMoving")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-ink-soft">{t("hint")}</p>
            <Button
              block
              disabled={status !== "ready" || !map || phase.kind === "saving"}
              onClick={() => void save(false)}
            >
              {phase.kind === "saving" ? <Spinner label={t("saving")} /> : null}
              {phase.kind === "saving" ? t("saving") : t("save")}
            </Button>
            {error ? <FormError>{errorMessage(error)}</FormError> : null}
            {error === "stale_version" ? (
              <Button variant="ghost" block onClick={() => router.refresh()}>
                {t("reload")}
              </Button>
            ) : null}
          </div>
        )}
      </GlassPanel>
    </>
  );
}
