import { getFormatter, getTranslations } from "next-intl/server";

import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle, Chip } from "@/shared/ui";

import { LEVEL_STATE } from "@/features/map/attention";
import { HomeStateChip } from "@/features/map/components/home-state-chip";

import type { ReportedWorksite } from "../server";

/**
 * The reported homes in the order the server decided, each a card that opens the home on the map.
 * Key facts first, as on the home's page: address, state, damage, what it needs, who is going,
 * how long it waits and the last news; vulnerability only for coordinators.
 * No positions or numbers: it says where help is needed, it does not rank neighbors. Name and
 * phone appear only when the reporter chose to show them (ADR 0017); the card is one link, so the
 * phone is text here and a call link on the home's page.
 */
export async function ReportedList({
  slug,
  homes,
  timeZone,
  now,
}: {
  slug: string;
  homes: ReportedWorksite[];
  timeZone: string;
  now: Date;
}) {
  const t = await getTranslations("worksites.reports");
  const tDamage = await getTranslations("worksite.damage");
  const tFacts = await getTranslations("worksite.facts");
  const format = await getFormatter();

  if (homes.length === 0) {
    return (
      <Card>
        <CardTitle>{t("emptyTitle")}</CardTitle>
        <CardBody>{t("emptyBody")}</CardBody>
        <Button variant="primary" className="mt-2 self-start" asChild>
          <Link href={`/emergencies/${slug}/worksites/new`}>{t("emptyReport")}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {homes.map((home) => {
        const waiting = LEVEL_STATE[home.level] === "needs_help";
        return (
          <li key={home.id}>
            <Card interactive className="gap-3" asChild>
              <Link href={`/emergencies/${slug}/worksites/${home.id}`}>
                <CardTitle>{home.addressText ?? home.address ?? t("noStreet")}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <HomeStateChip level={home.level} />
                  {home.damageLevel ? (
                    <Chip>{tDamage("chip", { level: tDamage(home.damageLevel) })}</Chip>
                  ) : null}
                  {home.hasVulnerablePeople ? <Chip>{t("vulnerable")}</Chip> : null}
                  {home.reportCount > 1 ? <Chip>{t("reportedBy", { count: home.reportCount })}</Chip> : null}
                </div>
                {home.needs.length > 0 ? (
                  <CardBody>{t("needs", { needs: format.list(home.needs, { type: "unit" }) })}</CardBody>
                ) : null}
                <CardBody>
                  {home.volunteerCount > 0
                    ? tFacts("goingCount", { count: home.volunteerCount })
                    : tFacts("goingNobody")}
                </CardBody>
                {home.contactName !== null || home.contactPhone !== null ? (
                  <CardBody>
                    {home.contactName && home.contactPhone
                      ? t("contact", { name: home.contactName, phone: home.contactPhone })
                      : (home.contactName ?? home.contactPhone)}
                  </CardBody>
                ) : null}
                {home.organizations.length > 0 ? (
                  <CardBody>
                    {t("attendedBy", {
                      organizations: format.list(
                        home.organizations.map((organization) => organization.name),
                        { type: "conjunction" },
                      ),
                    })}
                  </CardBody>
                ) : null}
                {waiting ? (
                  <p className="text-caption text-ink-muted">
                    <time dateTime={home.waitingSince.toISOString()}>
                      {t("waiting", {
                        relative: format.relativeTime(home.waitingSince, now),
                        date: format.dateTime(home.waitingSince, {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone,
                        }),
                      })}
                    </time>
                  </p>
                ) : null}
                <p className="text-caption text-ink-muted">
                  <time dateTime={home.updatedAt.toISOString()}>
                    {t("updated", { relative: format.relativeTime(home.updatedAt, now) })}
                  </time>
                </p>
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
