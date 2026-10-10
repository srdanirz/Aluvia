import { getLocale, getTranslations } from "next-intl/server";

import { EmergencyForm, loadEmergencyFormOptions, PageHeader } from "@/features/admin";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";

export default async function NewEmergencyPage() {
  const [{ disasterTypes, timeZones }, t, locale] = await Promise.all([
    loadEmergencyFormOptions(),
    getTranslations("admin.emergencies"),
    getLocale(),
  ]);
  return (
    <div className="flex max-w-prose animate-enter flex-col gap-12">
      <PageHeader title={t("newTitle")} lead={t("newLead")} />
      <EmergencyForm
        timeZones={timeZones}
        disasterTypes={disasterTypes.map((type) => ({
          key: type.key,
          name: readLocalizedText(type.name, locale, DEFAULT_LOCALE),
          workTypeCount: type.workTypeCount,
        }))}
      />
    </div>
  );
}
