import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ReportedList } from "@/features/worksites/components";
import { reportsQuerySchema } from "@/features/worksites/schemas";
import { getReportsScreen } from "@/features/worksites/server";
import { Link } from "@/shared/i18n/navigation";
import { Button, Page } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("worksites.reports");
  return { title: t("title") };
}

export default async function ReportsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/emergencies/[slug]/reports">) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const { cursor } = reportsQuerySchema.parse(query);
  const now = new Date();
  const [screen, t] = await Promise.all([
    getReportsScreen({ slug, locale, cursor: cursor ?? null, now }),
    getTranslations("worksites.reports"),
  ]);
  if (!screen) notFound();

  return (
    <Page className="animate-enter">
      <header className="flex flex-col gap-3">
        <h1 className="text-heading text-balance text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("lead")}</p>
      </header>
      <section className="flex flex-col gap-3">
        <ReportedList slug={slug} homes={screen.page.items} timeZone={screen.timeZone} now={now} />
        {screen.page.nextCursor ? (
          <Button variant="secondary" className="self-center" asChild>
            <Link
              href={{ pathname: `/emergencies/${slug}/reports`, query: { cursor: screen.page.nextCursor } }}
            >
              {t("more")}
            </Link>
          </Button>
        ) : null}
      </section>
    </Page>
  );
}
