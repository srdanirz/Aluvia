"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { workItemStatus } from "@/shared/db/schema/enums";
import { Link } from "@/shared/i18n/navigation";
import { Button, ButtonGroup, Card, CardTitle, FormError, Spinner, WorkStatusChip } from "@/shared/ui";

import type { MarkableStatus } from "../schemas";
import {
  markWorkItemStatusAction,
  markWorksiteArrivedAction,
  releaseWorksiteAction,
  renewWorksiteClaimAction,
} from "../server/actions";
import { useAction } from "@/shared/lib/use-action";

type MyWork = {
  id: string;
  worksiteId: string;
  workType: string;
  status: (typeof workItemStatus.enumValues)[number];
  version: number;
  expiresAt: Date | null;
  arrivedAt: Date | null;
};

/**
 * A home the volunteer took (issues #12, #13): its jobs listed, one set of buttons for all of them.
 * On the way: Llegué, Sigo en camino, Ya no voy. On site: Terminé, Avancé, Necesita más ayuda, and
 * the two closings found on arrival. The hold shown is the one lapsing first.
 */
export function MyWorkCard({
  slug,
  emergencyId,
  home,
  now,
}: {
  slug: string;
  emergencyId: string;
  home: { worksiteId: string; jobs: MyWork[] };
  now: Date;
}) {
  const t = useTranslations("work.mine");
  const tWork = useTranslations("work");
  const tStatus = useTranslations("workItems.status");
  const format = useFormatter();
  const { run, isPending, error } = useAction();
  const ref = { emergencyId, worksiteId: home.worksiteId };
  const items = home.jobs.map((job) => ({ workItemId: job.id, version: job.version }));
  const mark = (status: MarkableStatus) =>
    run(() => markWorkItemStatusAction({ emergencyId, items, status }));
  // On site once any job says so: arriving marks every job of the home at once.
  const arrivedAt = home.jobs.find((job) => job.arrivedAt)?.arrivedAt ?? null;
  const expiresAt = home.jobs
    .map((job) => job.expiresAt)
    .reduce<Date | null>((first, at) => (at && (!first || at < first) ? at : first), null);
  const isOnSite = arrivedAt !== null;

  return (
    <Card className="gap-3">
      <ul className="flex flex-col gap-2">
        {home.jobs.map((job) => (
          <li key={job.id} className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{job.workType}</CardTitle>
            <WorkStatusChip status={job.status}>{tStatus(job.status)}</WorkStatusChip>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-ink-muted">
        {arrivedAt
          ? t("arrived", { relative: format.relativeTime(arrivedAt, now) })
          : expiresAt && expiresAt > now
            ? t("expiresIn", { relative: format.relativeTime(expiresAt, now) })
            : expiresAt
              ? t("expired")
              : null}
      </p>
      {isOnSite ? (
        <>
          <ButtonGroup label={t("actions")} className="w-full">
            <Button
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => mark("closed_done")}
            >
              {t("done")}
            </Button>
            <Button
              variant="ghost"
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => mark("open_partially_done")}
            >
              {t("partial")}
            </Button>
            <Button
              variant="ghost"
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => mark("open_needs_follow_up")}
            >
              {t("followUp")}
            </Button>
          </ButtonGroup>
          <ButtonGroup label={t("otherClosings")} className="w-full">
            <Button
              variant="ghost"
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => mark("closed_done_by_others")}
            >
              {t("doneByOthers")}
            </Button>
            <Button
              variant="ghost"
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => mark("closed_no_help_wanted")}
            >
              {t("noHelpWanted")}
            </Button>
            <Button
              variant="ghost"
              size="compact"
              className="flex-1"
              disabled={isPending}
              onClick={() => run(() => releaseWorksiteAction(ref))}
            >
              {t("release")}
            </Button>
          </ButtonGroup>
        </>
      ) : (
        <ButtonGroup label={t("actions")} className="w-full">
          <Button
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => run(() => markWorksiteArrivedAction(ref))}
          >
            {t("arrive")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => run(() => renewWorksiteClaimAction(ref))}
          >
            {t("renew")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => run(() => releaseWorksiteAction(ref))}
          >
            {t("release")}
          </Button>
        </ButtonGroup>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/emergencies/${slug}/worksites/${home.worksiteId}`}>{t("openHome")}</Link>
        </Button>
        {isPending ? <Spinner label={tWork("saving")} /> : null}
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </Card>
  );
}
