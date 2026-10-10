import { getTranslations } from "next-intl/server";

import { Card, CardTitle, DescriptionList } from "@/shared/ui";

import { loadWorksiteContact } from "../server/contact-card";

/**
 * Everything the report holds, for coordinators and admins; renders nothing for anyone else.
 * The address is public too (ADR 0017); the rest is not. Every render is a logged contact view.
 */
export async function WorksiteContactCard({
  emergencyId,
  worksiteId,
}: {
  emergencyId: string;
  worksiteId: string;
}) {
  const contact = await loadWorksiteContact({ emergencyId, worksiteId });
  if (!contact) return null;
  const t = await getTranslations("worksite.contact");
  const items = [
    { term: t("address"), value: contact.addressText },
    { term: t("name"), value: contact.name },
    { term: t("phone"), value: contact.phone },
    { term: t("notes"), value: contact.notes },
    { term: t("vulnerable"), value: contact.hasVulnerablePeople ? t("vulnerableYes") : null },
  ].filter((item): item is { term: string; value: string } => item.value !== null);
  return (
    <Card className="gap-3">
      <CardTitle>{t("title")}</CardTitle>
      <DescriptionList items={items} />
      <p className="text-caption text-ink-muted">{t("logged")}</p>
    </Card>
  );
}
