import { ArrowRight, MapPin, PackageOpen, Users } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";

import { joinPath } from "@/features/members";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, CardBody, CardTitle, Chip } from "@/shared/ui";

import type { HelpWorksite, Viewer } from "../server";
import { ClaimButton } from "./claim-button";

export type HelpHome = HelpWorksite & { field: { peoplePresent: number; missingSupplies: string[] } | null };

type HelpListProps = {
  slug: string;
  emergencyId: string;
  homes: HelpHome[];
  viewer: Viewer;
  now: Date;
};

/**
 * The homes nobody is on, longest waiting first, each with one concrete action: take the
 * home (every free job of it). Who is looking decides that button: sign in, join the emergency, or "Voy para allá".
 */
export async function HelpList({ slug, emergencyId, homes, viewer, now }: HelpListProps) {
  const t = await getTranslations("work");
  const format = await getFormatter();

  if (homes.length === 0) {
    return (
      <Card>
        <CardTitle>{t("help.emptyTitle")}</CardTitle>
        <CardBody>{t("help.emptyBody")}</CardBody>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="primary" asChild>
            <Link href={`/emergencies/${slug}/worksites/new`}>{t("help.emptyReport")}</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/emergencies/${slug}/shifts`}>{t("help.emptyShifts")}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {homes.map((home) => {
        const hasFreeWork = home.workItems.length > 0;
        return (
          <li key={home.worksiteId}>
            <Card className="gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="urgent">
                  {t("help.waiting", { relative: format.relativeTime(home.waitingSince, now) })}
                </Chip>
                {home.damageLevel ? <Chip>{t(`damage.${home.damageLevel}`)}</Chip> : null}
                {home.isBlocked ? <Chip tone="urgent">{t("hazard.chip")}</Chip> : null}
              </div>
              <CardTitle>
                {format.list(
                  home.workItems.map((item) => item.workType),
                  { type: "unit" },
                )}
              </CardTitle>
              <div className="flex flex-col gap-1 text-body-sm text-ink-soft">
                {home.distanceMeters !== null ? (
                  <p className="flex items-center gap-2">
                    <MapPin aria-hidden className="size-icon-sm" strokeWidth={1.5} />
                    {t("help.distance", {
                      distance: format.number(home.distanceMeters / 1000, {
                        style: "unit",
                        unit: "kilometer",
                        maximumFractionDigits: 1,
                      }),
                    })}
                  </p>
                ) : null}
                {home.field ? (
                  <p className="flex items-center gap-2">
                    <Users aria-hidden className="size-icon-sm" strokeWidth={1.5} />
                    {t("help.peoplePresent", { count: home.field.peoplePresent })}
                  </p>
                ) : null}
                {home.field && home.field.missingSupplies.length > 0 ? (
                  <p className="flex items-center gap-2">
                    <PackageOpen aria-hidden className="size-icon-sm" strokeWidth={1.5} />
                    {t("help.missing", {
                      supplies: format.list(home.field.missingSupplies, { type: "conjunction" }),
                    })}
                  </p>
                ) : null}
              </div>
              {home.isBlocked ? (
                <CardBody>{t("hazard.body")}</CardBody>
              ) : hasFreeWork ? (
                <PrimaryAction
                  viewer={viewer}
                  slug={slug}
                  returnTo={`/emergencies/${slug}/worksites/${home.worksiteId}`}
                  claim={{ emergencyId, worksiteId: home.worksiteId, label: t("help.claim") }}
                />
              ) : null}
              <Button variant="ghost" className="self-start" asChild>
                <Link href={`/emergencies/${slug}/worksites/${home.worksiteId}`}>
                  {t("help.openHome")}
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

async function PrimaryAction({
  viewer,
  slug,
  returnTo,
  claim,
}: {
  viewer: Viewer;
  slug: string;
  // The home this card is about: signing in and joining come back to it.
  returnTo: string;
  claim: { emergencyId: string; worksiteId: string; label: string };
}) {
  const t = await getTranslations("work.help");
  if (viewer === "anonymous") {
    return (
      <Button variant="accent" block asChild>
        <Link href={{ pathname: "/login", query: { next: joinPath(slug, returnTo) } }}>{t("signIn")}</Link>
      </Button>
    );
  }
  if (viewer === "guest") {
    return (
      <Button variant="accent" block asChild>
        <Link href={joinPath(slug, returnTo)}>{t("join")}</Link>
      </Button>
    );
  }
  return <ClaimButton {...claim} />;
}
