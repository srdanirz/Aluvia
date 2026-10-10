import { getFormatter, getLocale, getTranslations } from "next-intl/server";

import {
  CloseEmergency,
  EmergencyAreaForm,
  EmergencySettingsForm,
  loadEmergency,
  MissingTranslations,
  NoticeForm,
  OfficialLayerForm,
  PageHeader,
  PurgeEmergency,
} from "@/features/admin";
import { readLocalizedText } from "@/shared/i18n/localized-text";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, Chip, DescriptionList, Section } from "@/shared/ui";

export default async function EmergencyPage({ params }: PageProps<"/[locale]/admin/emergencies/[slug]">) {
  const { slug } = await params;
  const [emergency, t, format, locale] = await Promise.all([
    loadEmergency(slug),
    getTranslations("admin.emergencies"),
    getFormatter(),
    getLocale(),
  ]);
  const isOpen = emergency.status === "open";
  const when = (date: Date) =>
    format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone: emergency.timeZone });
  const facts = [
    { term: t("typeTerm"), value: readLocalizedText(emergency.disasterTypeName, locale, DEFAULT_LOCALE) },
    {
      term: t("comunasTerm"),
      value: emergency.comunas.length > 0 ? format.list(emergency.comunas) : t("noComunas"),
    },
    { term: t("startedTerm"), value: when(emergency.startedAt) },
    { term: t("timeZoneTerm"), value: emergency.timeZone },
    { term: t("workTypesTerm"), value: t("workTypeCount", { count: emergency.workTypeCount }) },
    { term: t("suppliesTerm"), value: t("supplyTypeCount", { count: emergency.supplyTypeCount }) },
    { term: t("areaTerm"), value: emergency.hasArea ? t("areaSet") : t("areaMissing") },
  ];

  return (
    <div className="flex max-w-prose animate-enter flex-col gap-12">
      <PageHeader
        title={readLocalizedText(emergency.name, locale, emergency.defaultLocale)}
        action={<Chip tone={isOpen ? "pending" : "closed"}>{t(emergency.status)}</Chip>}
      />

      <Section title={t("summary")}>
        <Card>
          <DescriptionList items={facts} />
          {emergency.closedAt ? (
            <p className="text-body-sm text-ink-soft">{t("closedOn", { date: when(emergency.closedAt) })}</p>
          ) : null}
          <MissingTranslations texts={[emergency.name]} />
        </Card>
      </Section>

      {isOpen ? (
        <Section title={t("noticeTitle")} lead={t("noticeLead")}>
          <NoticeForm
            emergencyId={emergency.id}
            defaultLocale={emergency.defaultLocale}
            notice={
              emergency.notice && {
                id: emergency.notice.id,
                message: emergency.notice.message,
                publishedLabel: t("noticePublishedOn", { date: when(emergency.notice.publishedAt) }),
              }
            }
          />
        </Section>
      ) : null}

      <Section title={t("membersTitle")} lead={t("membersLead")}>
        <div>
          <Button variant="secondary" asChild>
            <Link href={`/admin/emergencies/${emergency.slug}/members`}>{t("membersLink")}</Link>
          </Button>
        </div>
      </Section>

      <Section title={t("settingsTitle")} lead={t("settingsLead")}>
        <EmergencySettingsForm
          emergencyId={emergency.id}
          disabled={!isOpen}
          settings={emergency.settings}
          defaultLocale={emergency.defaultLocale}
        />
      </Section>

      {isOpen ? (
        <>
          <Section title={t("areaTitle")}>
            <EmergencyAreaForm emergencyId={emergency.id} version={emergency.version} />
          </Section>
          <Section title={t("layerTitle")} lead={t("layerLead")}>
            <OfficialLayerForm emergencyId={emergency.id} />
          </Section>
          <Section title={t("closeTitle")}>
            <CloseEmergency emergencyId={emergency.id} />
          </Section>
        </>
      ) : (
        <Section title={t("purgeTitle")}>
          <PurgeEmergency emergencyId={emergency.id} />
        </Section>
      )}
    </div>
  );
}
