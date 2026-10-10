import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import * as rootParams from "next/root-params";
import { cache } from "react";

import { loadOfficialNotice, OfficialNotice } from "@/features/admin";
import { LEVEL_STATE } from "@/features/map/attention";
import { WorksitePanel } from "@/features/map/components/worksite-panel";
import { WorksiteAssignments } from "@/features/members";
import { WorksiteContactCard } from "@/features/worksites/components";
import { slugSchema, worksiteIdSchema } from "@/features/map/schemas";
import { findPublicWorksite } from "@/features/map/server/public-worksite";

type Params = PageProps<"/[locale]/emergencies/[slug]/worksites/[id]">["params"];

// One read per request: generateMetadata and the page share it (React cache), with one clock.
const loadWorksite = cache(async (slug: string, id: string) => {
  if (!slugSchema.safeParse(slug).success || !worksiteIdSchema.safeParse(id).success) notFound();
  // A home's level depends on the time of the request; without this Next tries to prerender it.
  await connection();
  const now = new Date();
  const home = await findPublicWorksite({ slug, id, locale: await rootParams.locale(), now });
  if (!home) notFound();
  return { home, now };
});

// The title is what WhatsApp shows when the link is shared: the emergency and the level, no address.
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, id } = await params;
  const { home } = await loadWorksite(slug, id);
  const t = await getTranslations();
  return {
    title: t("worksite.metaTitle", {
      emergency: home.emergencyName,
      state: t(`map.states.${LEVEL_STATE[home.level]}`),
    }),
  };
}

export default async function WorksitePage({ params }: { params: Params }) {
  const { slug, id } = await params;
  const [{ home, now }, notice] = await Promise.all([
    loadWorksite(slug, id),
    loadOfficialNotice(slug, await rootParams.locale()),
  ]);
  return (
    <WorksitePanel
      slug={slug}
      home={home}
      now={now}
      notice={<OfficialNotice text={notice} />}
      adminTools={<WorksiteAssignments emergencyId={home.emergencyId} worksiteId={home.id} />}
      contact={<WorksiteContactCard emergencyId={home.emergencyId} worksiteId={home.id} />}
    />
  );
}
