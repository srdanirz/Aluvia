import { getFormatter, getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import type { ReactNode } from "react";

import { joinPath } from "@/features/members";
import { Link } from "@/shared/i18n/navigation";
import { Button, Card, Chip, WorkStatusChip } from "@/shared/ui";

import { loadWorksiteJobsView } from "../server";
import { ClaimButton } from "./claim-button";
import { CoordinatorJobActions } from "./coordinator-job-actions";
import { JobStatusActions } from "./job-status-actions";
import { MyWorkCard } from "./my-work-card";

/**
 * A home's jobs with what the viewer can do: anyone updates a status (ADR 0018), a member takes a
 * job and works the ones they hold (anyone else signs in or joins and comes back here), a
 * coordinator verifies, marks duplicates and undoes the last change. A home without jobs gets `children`. Mounted by features/map's WorksitePanel.
 */
export async function WorksiteJobs({
  slug,
  emergencyId,
  worksiteId,
  children,
}: {
  slug: string;
  emergencyId: string;
  worksiteId: string;
  children: ReactNode;
}) {
  const locale = await rootParams.locale();
  const { viewer, jobs } = await loadWorksiteJobsView({ emergencyId, worksiteId, locale });
  if (jobs.length === 0) return children;
  const t = await getTranslations("work.jobs");
  const tStatus = await getTranslations("workItems.status");
  const tHazard = await getTranslations("work.hazard");
  const tHelp = await getTranslations("work.help");
  const format = await getFormatter();
  const now = new Date();
  const canClaim = viewer === "member" || viewer === "coordinator";
  // Someone who cannot take a job yet signs in or joins, and comes back to this home.
  const join = joinPath(slug, `/emergencies/${slug}/worksites/${worksiteId}`);
  const hasClaimable = jobs.some((job) => job.status.startsWith("open_") && !job.isClaimed && !job.isBlocked);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-subheading font-medium text-ink">{t("title")}</h2>
      {jobs[0]?.isBlocked ? (
        <div className="flex flex-col gap-2">
          <Chip tone="urgent" className="self-start">
            {tHazard("chip")}
          </Chip>
          <p className="text-body-sm text-ink-soft">{tHazard("body")}</p>
        </div>
      ) : null}
      <ul className="flex flex-col gap-3">
        {jobs.map((job) => {
          const isOpen = job.status.startsWith("open_");
          if (job.isMine && isOpen) {
            return (
              <li key={job.id}>
                <MyWorkCard slug={slug} emergencyId={emergencyId} work={{ ...job, worksiteId }} now={now} />
              </li>
            );
          }
          return (
            <li key={job.id}>
              <Card inset className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-ink">{job.workType}</span>
                  <div className="flex flex-wrap gap-2">
                    {job.isVerified ? <Chip tone="done">{t("verified")}</Chip> : null}
                    <WorkStatusChip status={job.status}>
                      {job.isClaimed && isOpen ? t("taken") : tStatus(job.status)}
                    </WorkStatusChip>
                  </div>
                </div>
                <p className="text-caption text-ink-muted">
                  {t("updated", { relative: format.relativeTime(job.updatedAt, now) })}
                </p>
                {canClaim && isOpen && !job.isClaimed && !job.isBlocked ? (
                  <ClaimButton emergencyId={emergencyId} workItemId={job.id} label={t("claim")} />
                ) : null}
                {isOpen ? (
                  <JobStatusActions emergencyId={emergencyId} workItemId={job.id} version={job.version} />
                ) : null}
                {viewer === "coordinator" ? (
                  <CoordinatorJobActions
                    emergencyId={emergencyId}
                    workItemId={job.id}
                    version={job.version}
                    isVerified={job.isVerified}
                    isOpen={isOpen}
                    isRevertible={job.isRevertible}
                  />
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>
      {!canClaim && hasClaimable ? (
        <Button variant="accent" block asChild>
          {viewer === "anonymous" ? (
            <Link href={{ pathname: "/login", query: { next: join } }}>{tHelp("signIn")}</Link>
          ) : (
            <Link href={join}>{tHelp("join")}</Link>
          )}
        </Button>
      ) : null}
    </section>
  );
}
