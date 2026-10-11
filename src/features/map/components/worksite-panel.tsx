import { ArrowLeft, OctagonX, Phone } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Link } from "@/shared/i18n/navigation";
import { WorksiteJobs } from "@/features/work-items/components";
import { Button, Card, Chip, DescriptionList, GlassPanel, IconButton, WorkStatusChip } from "@/shared/ui";

import { isOpenWorkStatus, LEVEL_DETAIL, LEVEL_STATE } from "../attention";
import type { PublicWorksite } from "../server/public-worksite";
import { Directions } from "./directions";
import { FocusWorksite } from "./focus-worksite";
import { HomeStateChip } from "./home-state-chip";
import { ShareButton } from "./share-button";

/**
 * A home's public page over the map. Key facts first, in the order a volunteer decides by:
 * address, state, what it needs, who is going, how long it waits and the last news; then the work,
 * how to get there and how to share it.
 * Only the public form reaches it (findPublicWorksite): name and phone appear only when the
 * reporter chose to show them (ADR 0017).
 */
export async function WorksitePanel({
  slug,
  home,
  now,
  notice,
  adminTools,
  contact,
  fieldState,
}: {
  slug: string;
  home: PublicWorksite;
  now: Date;
  /** The emergency's official notice (`OfficialNotice` from the admin feature), above everything. */
  notice: ReactNode;
  /** Tools only an admin sees (home assignments); they render nothing for anyone else. */
  adminTools?: ReactNode;
  /** Full address and contact for coordinators (features/worksites); nothing for anyone else. */
  contact?: ReactNode;
  /** People and supplies (features/worksite-updates): current state, update button, history. */
  fieldState?: ReactNode;
}) {
  const t = await getTranslations("worksite");
  const tMap = await getTranslations("map");
  const tStatus = await getTranslations("workItems.status");
  const format = await getFormatter();
  const tFacts = await getTranslations("worksite.facts");
  const state = LEVEL_STATE[home.level];
  const detail = LEVEL_DETAIL[home.level];
  const needs = [
    ...new Set(home.workItems.filter((item) => isOpenWorkStatus(item.status)).map((item) => item.workType)),
  ];
  const facts = [
    {
      term: tFacts("needs"),
      value: needs.length > 0 ? format.list(needs, { type: "unit" }) : tFacts("needsNothing"),
    },
    {
      term: tFacts("going"),
      value:
        home.volunteerCount > 0
          ? tFacts("goingCount", { count: home.volunteerCount })
          : tFacts("goingNobody"),
    },
    ...(home.peoplePresent !== null
      ? [{ term: tFacts("present"), value: tFacts("presentCount", { count: home.peoplePresent }) }]
      : []),
    ...(state === "needs_help"
      ? [{ term: tFacts("waiting"), value: format.relativeTime(home.waitingSince, now) }]
      : []),
    { term: tFacts("updated"), value: format.relativeTime(home.updatedAt, now) },
  ];
  const position = home.position;
  const title = home.address ?? t("title", { emergency: home.emergencyName });
  // A coordinator's contact card already shows both, with its access logged.
  const showPublicContact = !contact && (home.contactName !== null || home.contactPhone !== null);
  const tHazard = await getTranslations("worksites.hazard");

  return (
    <GlassPanel className="flex min-h-0 animate-enter flex-col gap-6 overflow-y-auto">
      {notice}
      {position ? <FocusWorksite lat={position.lat} lng={position.lng} /> : null}
      <header className="flex items-start gap-3">
        <IconButton variant="ghost" label={t("back")} asChild>
          <Link href={`/emergencies/${slug}`}>
            <ArrowLeft aria-hidden />
          </Link>
        </IconButton>
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-sm text-ink">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <HomeStateChip level={home.level} />
            {home.damageLevel ? (
              <Chip>{t("damage.chip", { level: t(`damage.${home.damageLevel}`) })}</Chip>
            ) : null}
          </div>
          <p className="text-body-sm text-ink-muted">
            {t("reported", {
              date: format.dateTime(home.reportedAt, {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: home.timeZone,
              }),
            })}
          </p>
          {home.level === "do_not_enter" ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <div className="flex flex-wrap gap-2">
                {home.hazards.map((hazard) => (
                  <Chip key={hazard} tone="urgent" icon={<OctagonX />}>
                    {tHazard(hazard)}
                  </Chip>
                ))}
              </div>
              <p className="text-body-sm text-ink-soft">{t("hazardsHint")}</p>
            </div>
          ) : null}
          {detail ? <p className="text-body-sm text-ink-soft">{tMap(`detail.${detail}`)}</p> : null}
        </div>
      </header>
      <DescriptionList items={facts} />
      {home.organizations.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-subheading font-medium text-ink">
            {t("attendedBy", {
              organizations: format.list(
                home.organizations.map((organization) => organization.name),
                { type: "conjunction" },
              ),
            })}
          </h2>
          {home.organizations.map((organization) =>
            organization.publicContact ? (
              <p key={organization.name} className="text-body-sm text-ink-soft">
                {t("organizationContact", {
                  organization: organization.name,
                  contact: organization.publicContact,
                })}
              </p>
            ) : null,
          )}
        </section>
      ) : null}
      {contact}
      {showPublicContact ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-subheading font-medium text-ink">{t("publicContact.title")}</h2>
          {home.contactName ? <p className="text-body text-ink">{home.contactName}</p> : null}
          {home.contactPhone ? (
            <Button variant="secondary" className="self-start" asChild>
              <a
                href={`tel:${home.contactPhone}`}
                aria-label={t("publicContact.call", { phone: home.contactPhone })}
              >
                <Phone aria-hidden />
                {home.contactPhone}
              </a>
            </Button>
          ) : null}
        </section>
      ) : null}

      {fieldState}

      {/* The jobs with what the viewer can do; a home without jobs keeps this list. */}
      <WorksiteJobs slug={slug} emergencyId={home.emergencyId} worksiteId={home.id}>
        <section className="flex flex-col gap-3">
          <h2 className="text-subheading font-medium text-ink">{t("work")}</h2>
          {home.workItems.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {home.workItems.map((item, index) => (
                <li key={index}>
                  <Card inset className="flex-row items-center justify-between gap-3">
                    <span className="text-body text-ink">{item.workType}</span>
                    <WorkStatusChip status={item.status}>{tStatus(item.status)}</WorkStatusChip>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-soft">{t("noWork")}</p>
          )}
        </section>
      </WorksiteJobs>

      {adminTools}

      {position ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-subheading font-medium text-ink">{t("directions")}</h2>
          <Directions point={position} />
        </section>
      ) : (
        <p className="text-body-sm text-ink-muted">{t("noLocation")}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <ShareButton title={title} />
      </div>
    </GlassPanel>
  );
}
