import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";

import { loadOfficialNotice, OfficialNotice } from "@/features/admin";
import { MapLegend } from "@/features/map/components/map-legend";
import { slugSchema } from "@/features/map/schemas";
import { findMapEmergency } from "@/features/map/server/map-emergency";
import { GlassPanel } from "@/shared/ui";

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

export default async function EmergencyMapPage({ params }: PageProps<"/[locale]/emergencies/[slug]">) {
  const { slug } = await params;
  const [t, notice] = await Promise.all([
    getTranslations("map"),
    loadOfficialNotice(slug, await rootParams.locale()),
  ]);
  return (
    <GlassPanel className="flex min-h-0 animate-enter flex-col gap-4 overflow-y-auto">
      <OfficialNotice text={notice} />
      <h1 className="text-heading-sm text-ink">{t("panelTitle")}</h1>
      <p className="text-body-sm text-ink-soft">{t("hint")}</p>
      <MapLegend />
    </GlassPanel>
  );
}
