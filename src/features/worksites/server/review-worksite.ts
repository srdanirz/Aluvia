import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { worksites } from "@/shared/db/schema";
import type { worksiteReviewFlag } from "@/shared/db/schema/enums";
import type { Executor } from "@/shared/db/types";

export type ReviewFlag = (typeof worksiteReviewFlag.enumValues)[number];

/**
 * Whether a home may have its work claimed: not while it carries a "do not enter" hazard nobody
 * reviewed. The claim's conditional UPDATE puts this in its WHERE, so the database decides it
 * (STYLEGUIDE, Concurrencia): `... AND claimed_by IS NULL AND ${worksiteAcceptsClaims(workItems.worksiteId)}`.
 */
export function worksiteAcceptsClaims(worksiteId: AnyPgColumn | SQL): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM worksites hz
    WHERE hz.id = ${worksiteId} AND cardinality(hz.hazards) > 0 AND hz.hazards_reviewed_at IS NULL
  )`;
}

type Versioned = { emergencyId: string; worksiteId: string; version: number };
export type ReviewResult = { ok: true; version: number } | { ok: false; code: "stale_version" };

async function updateVersioned(
  database: Executor,
  { emergencyId, worksiteId, version }: Versioned,
  set: Record<string, SQL | Date | string>,
) {
  const [row] = await database
    .update(worksites)
    .set({ ...set, version: sql`${worksites.version} + 1`, updatedAt: sql`now()` })
    .where(
      and(
        eq(worksites.id, worksiteId),
        eq(worksites.emergencyId, emergencyId),
        eq(worksites.version, version),
      ),
    )
    .returning({ version: worksites.version });
  return row
    ? ({ ok: true, version: row.version } as const)
    : ({ ok: false, code: "stale_version" } as const);
}

/** A coordinator looked at the home and settles one review flag. */
export function resolveWorksiteReviewFlag(
  database: Executor,
  input: Versioned & { flag: ReviewFlag },
): Promise<ReviewResult> {
  return updateVersioned(database, input, {
    reviewFlags: sql`array_remove(${worksites.reviewFlags}, ${input.flag}::worksite_review_flag)`,
  });
}

/** A coordinator checked the hazards on site (or with the resident): work can be claimed again. */
export function markWorksiteHazardsReviewed(
  database: Executor,
  input: Versioned & { reviewedBy: string },
): Promise<ReviewResult> {
  return updateVersioned(database, input, {
    hazardsReviewedAt: sql`now()`,
    hazardsReviewedBy: input.reviewedBy,
  });
}
