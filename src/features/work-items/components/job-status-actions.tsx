"use client";

import { useTranslations } from "next-intl";

import { useAction } from "@/shared/lib/use-action";
import { Button, ButtonGroup, Disclosure, FormError } from "@/shared/ui";

import type { MarkableStatus } from "../schemas";
import { markWorkItemStatusAction } from "../server/actions";

/**
 * What anyone at a home saw of a job they do not hold (ADR 0018): no account, folded so it does not
 * crowd the page. The version is the one rendered, so a change made meanwhile answers stale_version.
 */
export function JobStatusActions({
  emergencyId,
  workItemId,
  version,
}: {
  emergencyId: string;
  workItemId: string;
  version: number;
}) {
  const t = useTranslations("work.jobs");
  const { run, isPending, error } = useAction();
  const mark = (status: MarkableStatus) =>
    run(() => markWorkItemStatusAction({ emergencyId, workItemId, status, version }));

  return (
    <Disclosure label={t("updateStatus")}>
      <div className="flex flex-col gap-2">
        <p className="text-caption text-ink-muted">{t("updateStatusHint")}</p>
        <ButtonGroup label={t("updateStatus")} className="w-full">
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => mark("open_partially_done")}
          >
            {t("markPartial")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => mark("open_needs_follow_up")}
          >
            {t("markFollowUp")}
          </Button>
          <Button size="compact" className="flex-1" disabled={isPending} onClick={() => mark("closed_done")}>
            {t("markDone")}
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
            {t("markDoneByOthers")}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            className="flex-1"
            disabled={isPending}
            onClick={() => mark("closed_no_help_wanted")}
          >
            {t("markNoHelpWanted")}
          </Button>
        </ButtonGroup>
        {error ? <FormError>{error}</FormError> : null}
      </div>
    </Disclosure>
  );
}
