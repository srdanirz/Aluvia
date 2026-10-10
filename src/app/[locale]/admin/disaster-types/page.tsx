import { Plus } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { loadDisasterTypeList, LoadMore, MissingTranslations, PageHeader } from "@/features/admin";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle } from "@/shared/ui";

export default async function DisasterTypesPage({
  searchParams,
}: PageProps<"/[locale]/admin/disaster-types">) {
  const { after } = await searchParams;
  const [page, t, locale] = await Promise.all([
    loadDisasterTypeList(after),
    getTranslations("admin.disasterTypes"),
    getLocale(),
  ]);

  return (
    <div className="flex animate-enter flex-col gap-12">
      <PageHeader
        title={t("title")}
        action={
          <Button asChild>
            <Link href="/admin/disaster-types/new">
              <Plus aria-hidden />
              {t("new")}
            </Link>
          </Button>
        }
      />
      {page.items.length === 0 ? (
        <p className="text-body text-ink-soft">{t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {page.items.map((type) => (
            <li key={type.key}>
              <Link href={`/admin/disaster-types/${type.key}`} className="block h-full rounded-card">
                <Card interactive className="h-full">
                  <CardTitle>{readLocalizedText(type.name, locale, DEFAULT_LOCALE)}</CardTitle>
                  <CardBody>
                    {t("templateSummary", {
                      key: type.key,
                      workTypes: type.workTypeCount,
                      supplyTypes: type.supplyTypeCount,
                    })}
                  </CardBody>
                  <MissingTranslations texts={[type.name]} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <LoadMore pathname="/admin/disaster-types" cursor={page.nextCursor} />
    </div>
  );
}
