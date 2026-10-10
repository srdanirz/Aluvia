import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ReportForm, ReportPage } from "@/features/worksites/components";
import { findReportForm, reportSourceFor } from "@/features/worksites/server";
import { getEmergencyAccess } from "@/shared/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksites.report");
  return { title: t("title") };
}

export default async function NewWorksitePage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/new">) {
  const { locale, slug } = await params;
  const form = await findReportForm({ slug, locale });
  if (!form) notFound();
  const [t, access] = await Promise.all([
    getTranslations("worksites.report"),
    getEmergencyAccess(form.emergency.id),
  ]);

  return (
    <ReportPage eyebrow={form.emergency.name} title={t("title")}>
      <ReportForm
        slug={form.emergency.slug}
        workTypes={form.workTypes}
        emergencyNumbers={form.emergencyNumbers}
        source={reportSourceFor(access)}
      />
    </ReportPage>
  );
}
