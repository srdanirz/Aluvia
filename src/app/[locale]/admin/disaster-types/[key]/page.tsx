import { getLocale } from "next-intl/server";

import { DisasterTypeForm, loadDisasterType, MissingTranslations, PageHeader } from "@/features/admin";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";

export default async function DisasterTypePage({
  params,
}: PageProps<"/[locale]/admin/disaster-types/[key]">) {
  const { key } = await params;
  const [type, locale] = await Promise.all([loadDisasterType(key), getLocale()]);
  return (
    <div className="flex max-w-prose animate-enter flex-col gap-12">
      <PageHeader
        title={readLocalizedText(type.name, locale, DEFAULT_LOCALE)}
        action={<MissingTranslations texts={[type.name, ...type.workTypes.map((w) => w.name)]} />}
      />
      <DisasterTypeForm initial={type} />
    </div>
  );
}
