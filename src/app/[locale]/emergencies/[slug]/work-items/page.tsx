import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import {
  HELP_INTRO_COOKIE,
  HelpIntro,
  HelpList,
  LocateButton,
  MyWorkCard,
} from "@/features/work-items/components";
import { helpQuerySchema } from "@/features/work-items/schemas";
import { loadHelpView } from "@/features/work-items/server";
import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("work.help");
  return { title: t("title") };
}

export default async function WorkItemsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/emergencies/[slug]/work-items">) {
  const [{ locale, slug }, query, cookieStore] = await Promise.all([params, searchParams, cookies()]);
  const { near, cursor } = helpQuerySchema.parse(query);
  const view = await loadHelpView({ slug, locale, origin: near, cursor });
  if (!view) notFound();
  const t = await getTranslations("work");
  const now = new Date();
  const listPath = `/emergencies/${slug}/work-items`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow animate-enter flex-col gap-8 px-4 py-8 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-heading text-balance text-ink">{t("help.title")}</h1>
        <p className="text-body text-ink-soft">{t("help.lead")}</p>
      </header>
      {cookieStore.has(HELP_INTRO_COOKIE) ? null : <HelpIntro />}
      {view.mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-subheading font-medium text-ink">{t("mine.title")}</h2>
          <ul className="flex flex-col gap-3">
            {view.mine.map((work) => (
              <li key={work.id}>
                <MyWorkCard slug={slug} emergencyId={view.emergency.id} work={work} now={now} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="flex flex-col gap-3">
        <LocateButton />
        <HelpList
          slug={slug}
          emergencyId={view.emergency.id}
          homes={view.homes}
          viewer={view.viewer}
          now={now}
        />
        {view.nextCursor ? (
          <Button variant="secondary" className="self-center" asChild>
            <Link
              href={{
                pathname: listPath,
                query: { cursor: view.nextCursor, ...(query.near ? { near: query.near } : {}) },
              }}
            >
              {t("help.more")}
            </Link>
          </Button>
        ) : null}
      </section>
      <Button variant="ghost" className="self-start" asChild>
        <Link href={`/emergencies/${slug}/shifts`}>{t("help.shifts")}</Link>
      </Button>
    </main>
  );
}
