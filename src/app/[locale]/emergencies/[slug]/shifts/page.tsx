import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ShiftList } from "@/features/shifts/components";
import { shiftsQuerySchema } from "@/features/shifts/schemas";
import { loadShiftsView } from "@/features/shifts/server";
import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shifts");
  return { title: t("title") };
}

export default async function ShiftsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/emergencies/[slug]/shifts">) {
  const [{ locale, slug }, query] = await Promise.all([params, searchParams]);
  const { cursor } = shiftsQuerySchema.parse(query);
  const view = await loadShiftsView({ slug, locale, cursor });
  if (!view) notFound();
  const t = await getTranslations("shifts");

  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow animate-enter flex-col gap-8 px-4 py-8 md:py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-heading text-balance text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("lead")}</p>
      </header>
      <ShiftList
        slug={slug}
        emergencyId={view.emergency.id}
        timeZone={view.emergency.timeZone}
        shifts={view.page.items}
        viewer={view.viewer}
      />
      {view.page.nextCursor ? (
        <Button variant="secondary" className="self-center" asChild>
          <Link href={{ pathname: `/emergencies/${slug}/shifts`, query: { cursor: view.page.nextCursor } }}>
            {t("more")}
          </Link>
        </Button>
      ) : null}
      <Button variant="ghost" className="self-start" asChild>
        <Link href={`/emergencies/${slug}/work-items`}>{t("help")}</Link>
      </Button>
    </main>
  );
}
