import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PlacementPanel } from "@/features/worksites/components";
import { getPlacementScreen } from "@/features/worksites/server";
import { CardBody, GlassPanel } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksites.placement");
  return { title: t("placeTitle") };
}

export default async function WorksiteLocationPage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/[id]/location">) {
  const { slug, id } = await params;
  const [screen, t] = await Promise.all([
    getPlacementScreen({ slug, worksiteId: id }),
    getTranslations("worksites.placement"),
  ]);
  if (!screen) notFound();
  if (screen.status === "forbidden") {
    return (
      <GlassPanel>
        <CardBody>{t("forbidden")}</CardBody>
      </GlassPanel>
    );
  }
  return <PlacementPanel key={screen.target.version} slug={slug} target={screen.target} />;
}
