"use client";

import { useFormatter, useTranslations } from "next-intl";

import type { workItemStatus } from "@/shared/db/schema/enums";
import { Link } from "@/shared/i18n/navigation";
import { Button, ButtonGroup, Card, CardTitle, FormError, Spinner, WorkStatusChip } from "@/shared/ui";

import type { MarkableStatus } from "../schemas";
import {
  markWorkItemArrivedAction,
  markWorkItemStatusAction,
  releaseWorkItemAction,
  renewWorkItemClaimAction,
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
 * A job the volunteer holds (issues #12, #13). On the way: Llegué, Sigo en camino, Ya no voy.
 * On site: Terminé, Avancé, Necesita más ayuda, and the two closings found on arrival.
 */
export function MyWorkCard({
  slug,
  emergencyId,
  work,
  now,
}: {
  slug: string;
  emergencyId: string;
  work: MyWork;
  now: Date;
}) {
  const t = useTranslations("work.mine");
  const tWork = useTranslations("work");
  const tStatus = useTranslations("workItems.status");
  const format = useFormatter();
  const { run, isPending, error } = useAction();
  const ref = { emergencyId, workItemId: work.id };
  const mark = (status: MarkableStatus) =>
    run(() => markWorkItemStatusAction({ ...ref, status, version: work.version }));
  const isOnSite = work.arrivedAt !== null;

  return (
    <Card className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{work.workType}</CardTitle>
        <WorkStatusChip status={work.status}>{tStatus(work.status)}</WorkStatusChip>
      </div>
      <p className="text-body-sm text-ink-muted">
        {work.arrivedAt
          ? t("arrived", { relative: format.relativeTime(work.arrivedAt, now) })
          : work.expiresAt && work.expiresAt > now
            ? t("expiresIn", { relative: format.relativeTime(work.expiresAt, now) })
            : work.expiresAt
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
              onClick={() => run(() => releaseWorkItemAction(ref))}
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
            onClick={() => run(() => markWorkItemArrivedAction(ref))}
          >
            {t("arrive")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => run(() => renewWorkItemClaimAction(ref))}
          >
            {t("renew")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => run(() => releaseWorkItemAction(ref))}
          >
            {t("release")}
          </Button>
        </ButtonGroup>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" asChild>
          <Link href={`/emergencies/${slug}/worksites/${work.worksiteId}`}>{t("openHome")}</Link>
        </Button>
        {isPending ? <Spinner label={tWork("saving")} /> : null}
      </div>
      {error ? <FormError>{error}</FormError> : null}
    </Card>
  );
}
