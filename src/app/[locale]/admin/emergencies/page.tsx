import { Plus } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import { loadEmergencyList, LoadMore, MissingTranslations, PageHeader } from "@/features/admin";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle, Chip } from "@/shared/ui";

export default async function EmergenciesPage({ searchParams }: PageProps<"/[locale]/admin/emergencies">) {
  const { after } = await searchParams;
  const [page, t, format, locale] = await Promise.all([
    loadEmergencyList(after),
    getTranslations("admin.emergencies"),
    getFormatter(),
    getLocale(),
  ]);

  return (
    <div className="flex animate-enter flex-col gap-12">
      <PageHeader
        title={t("title")}
        action={
          <Button asChild>
            <Link href="/admin/emergencies/new">
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </Button>
        }
      />
      {page.items.length === 0 ? (
        <p className="text-body text-ink-soft">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((emergency) => (
            <li key={emergency.id}>
              <Link href={`/admin/emergencies/${emergency.slug}`} className="block rounded-card">
                <Card interactive>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle>
                      {readLocalizedText(emergency.name, locale, emergency.defaultLocale)}
                    </CardTitle>
                    <Chip tone={emergency.status === "open" ? "pending" : "closed"}>
                      {t(emergency.status)}
                    </Chip>
                  </div>
                  <CardBody>
                    {readLocalizedText(emergency.disasterTypeName, locale, DEFAULT_LOCALE)} ·{" "}
                    {t("startedOn", {
                      date: format.dateTime(emergency.startedAt, {
                        dateStyle: "medium",
                        timeZone: emergency.timeZone,
                      }),
                    })}
                  </CardBody>
                  <MissingTranslations texts={[emergency.name]} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LoadMore pathname="/admin/emergencies" cursor={page.nextCursor} />
    </div>
  );
}
