import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadOfficialNotice, OfficialNotice } from "@/features/admin";
import { UpdateForm } from "@/features/worksite-updates/components";
import { getUpdateScreen } from "@/features/worksite-updates/server";
import { PendingWrites, ReportPage } from "@/features/worksites/components";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksiteUpdates.form");
  return { title: t("title") };
}

export default async function NewWorksiteUpdatePage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/[id]/updates/new">) {
  const { locale, slug, id } = await params;
  const [form, t, notice] = await Promise.all([
    getUpdateScreen({ slug, worksiteId: id, locale }),
    getTranslations("worksiteUpdates.form"),
    loadOfficialNotice(slug, locale),
  ]);
  if (!form) notFound();

  return (
    <ReportPage
      notice={<OfficialNotice text={notice} />}
      eyebrow={form.emergency.name}
      title={t("title")}
      lead={t("lead")}
    >
      <PendingWrites kind="worksite_update" />
      <UpdateForm
        slug={form.emergency.slug}
        worksiteId={id}
        supplyTypes={form.supplyTypes}
        current={
          form.current
            ? {
                id: form.current.id,
                peoplePresent: form.current.peoplePresent,
                missingSupplyKeys: form.current.missingSupplyKeys,
                createdAt: form.current.createdAt.toISOString(),
              }
            : null
        }
      />
    </ReportPage>
  );
}
