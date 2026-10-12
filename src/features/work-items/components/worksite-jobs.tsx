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
 * A home's jobs with what the viewer can do, per home and not per job: a member takes the home
 * ("Voy para allá", every free job at once) and works it from one card; anyone else signs in or
 * joins and comes back here; anyone updates the open jobs at once (ADR 0018). A coordinator
 * still verifies, marks duplicates and undoes the last change job by job. A home without jobs gets `children`. Mounted by features/map's WorksitePanel.
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
  const open = jobs.filter((job) => job.status.startsWith("open_"));
  const mine = open.filter((job) => job.isMine);
  // Open jobs nobody here holds: what "Voy para allá" takes and what anyone can update.
  const others = open.filter((job) => !job.isMine);
  const hasClaimable = others.some((job) => !job.isClaimed && !job.isBlocked);

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
      {mine.length > 0 ? (
        <MyWorkCard
          slug={slug}
          emergencyId={emergencyId}
          home={{ worksiteId, jobs: mine.map((job) => ({ ...job, worksiteId })) }}
          now={now}
        />
      ) : hasClaimable && canClaim ? (
        <ClaimButton emergencyId={emergencyId} worksiteId={worksiteId} label={t("claim")} />
      ) : hasClaimable ? (
        <Button variant="accent" block asChild>
          {viewer === "anonymous" ? (
            <Link href={{ pathname: "/login", query: { next: join } }}>{tHelp("signIn")}</Link>
          ) : (
            <Link href={join}>{tHelp("join")}</Link>
          )}
        </Button>
      ) : null}
      <ul className="flex flex-col gap-3">
        {jobs
          .filter((job) => !(job.isMine && job.status.startsWith("open_")))
          .map((job) => {
            const isOpen = job.status.startsWith("open_");
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
      {others.length > 0 ? (
        <JobStatusActions
          emergencyId={emergencyId}
          items={others.map((job) => ({ workItemId: job.id, version: job.version }))}
        />
      ) : null}
    </section>
  );
}
