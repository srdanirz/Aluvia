import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ReportPage, ReviewQueue } from "@/features/worksites/components";
import { getReviewScreen } from "@/features/worksites/server";
import { Card } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksites.review");
  return { title: t("title") };
}

export default async function ReviewWorksitesPage({
  params,
}: PageProps<"/[locale]/emergencies/[slug]/worksites/review">) {
  const { locale, slug } = await params;
  const [screen, t] = await Promise.all([
    getReviewScreen({ slug, locale }),
    getTranslations("worksites.review"),
  ]);
  if (!screen) notFound();

  return (
    <ReportPage eyebrow={screen.emergency.name} title={t("title")} lead={screen.page ? t("lead") : undefined}>
      {screen.page ? (
        <ReviewQueue slug={screen.emergency.slug} initial={screen.page} />
      ) : (
        <Card>
          <p className="text-body text-ink-soft">{t("forbidden")}</p>
        </Card>
      )}
    </ReportPage>
  );
}
