import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";

import { loadOfficialNotice, OfficialNotice } from "@/features/admin";
import { MapLegend } from "@/features/map/components/map-legend";
import { slugSchema } from "@/features/map/schemas";
import { findMapEmergency } from "@/features/map/server/map-emergency";
import { loadMapSummary } from "@/features/map/server/map-summary";
import { Link } from "@/shared/i18n/navigation";
import { Button, Disclosure, GlassPanel } from "@/shared/ui";

// The emergency's name only goes in the title; the layout does the one read of the emergency (and
// its 404). The panel reads only the official notice, which pins above everything (ADR 0015).
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/emergencies/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  // Validated before the cached read, so random slugs do not fill the cache.
  if (!slugSchema.safeParse(slug).success) return {};
  const emergency = await findMapEmergency(slug, await rootParams.locale());
  const t = await getTranslations("map");
  return emergency ? { title: t("title", { emergency: emergency.name }) } : {};
}

// A short strip, not a sheet: two numbers and the two things people come to do. The map stays the
// main thing on a phone; the color key is folded until asked for.
export default async function EmergencyMapPage({ params }: PageProps<"/[locale]/emergencies/[slug]">) {
  const { slug } = await params;
  const [t, notice, summary] = await Promise.all([
    getTranslations("map"),
    loadOfficialNotice(slug, await rootParams.locale()),
    slugSchema.safeParse(slug).success ? loadMapSummary(slug) : null,
  ]);
  const base = `/emergencies/${slug}`;
  return (
    <GlassPanel className="flex min-h-0 animate-enter flex-col gap-3 overflow-y-auto p-4 md:gap-4 md:p-6">
      <OfficialNotice text={notice} />
      {summary ? (
        <p className="text-body-sm text-ink">
          <span className="font-medium">{t("summary", { homes: summary.homes })}</span>
          <span className="text-ink-soft"> · {t("waiting", { waiting: summary.waiting })}</span>
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" block asChild>
          <Link href={`${base}/worksites/new`}>{t("askHelp")}</Link>
        </Button>
        <Button variant="secondary" block asChild>
          <Link href={`${base}/work-items`}>{t("offerHelp")}</Link>
        </Button>
      </div>
      <Disclosure label={t("legendToggle")}>
        <MapLegend />
      </Disclosure>
    </GlassPanel>
  );
}
