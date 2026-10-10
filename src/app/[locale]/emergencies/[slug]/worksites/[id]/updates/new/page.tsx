import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { UpdateForm } from "@/features/worksite-updates/components";
import { getUpdateScreen } from "@/features/worksite-updates/server";
import { PendingWrites, ReportPage } from "@/features/worksites/components";
import { Card } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksiteUpdates.form");
  return { title: t("title") };
}

export default async function NewWorksiteUpdatePage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/[id]/updates/new">) {
  const { locale, slug, id } = await params;
  const [screen, t] = await Promise.all([
    getUpdateScreen({ slug, worksiteId: id, locale }),
    getTranslations("worksiteUpdates.form"),
  ]);
  if (!screen) notFound();
  const { form, canUpdate: allowed } = screen;

  return (
    <ReportPage eyebrow={form.emergency.name} title={t("title")} lead={allowed ? t("lead") : undefined}>
      <PendingWrites kind="worksite_update" />
      {allowed ? (
        <UpdateForm
          slug={form.emergency.slug}
          worksiteId={id}
          supplyTypes={form.supplyTypes}
          current={
            form.current
              ? {
                  peoplePresent: form.current.peoplePresent,
                  missingSupplyKeys: form.current.missingSupplyKeys,
                  createdAt: form.current.createdAt.toISOString(),
                }
              : null
          }
        />
      ) : (
        <Card>
          <p className="text-body text-ink-soft">{t("signIn")}</p>
        </Card>
      )}
    </ReportPage>
  );
}
