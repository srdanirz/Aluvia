import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { BatchImport, ReportPage } from "@/features/worksites/components";
import { canImportWorksites, findReportForm } from "@/features/worksites/server";
import { getEmergencyAccess } from "@/shared/auth";
import { Card } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksites.batch");
  return { title: t("title") };
}

export default async function BatchWorksitesPage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/batch">) {
  const { locale, slug } = await params;
  const form = await findReportForm({ slug, locale });
  if (!form) notFound();
  const [t, access] = await Promise.all([
    getTranslations("worksites.batch"),
    getEmergencyAccess(form.emergency.id),
  ]);

  return (
    <ReportPage eyebrow={form.emergency.name} title={t("title")} lead={t("lead")}>
      {canImportWorksites(access) ? (
        <BatchImport slug={form.emergency.slug} workTypes={form.workTypes} />
      ) : (
        <Card>
          <p className="text-body text-ink-soft">{t("forbidden")}</p>
        </Card>
      )}
    </ReportPage>
  );
}
