import "server-only";

import { sql } from "drizzle-orm";

import { sqlArray } from "@/shared/db/sql-array";
import type { Executor } from "@/shared/db/types";

import type { worksiteHazard } from "@/shared/db/schema/enums";

import type { WorksiteSource } from "../schemas";
import type { ReviewFlag } from "./review-worksite";

export type Hazard = (typeof worksiteHazard.enumValues)[number];

/**
 * The coordinators' review queue: homes of an emergency without a pin, with a review flag, or
 * with "do not enter" hazards nobody reviewed, oldest first. It shows the written address, which
 * is contact data, so every page records one contact_views row per home in the same transaction
 * (SECURITY.md). Two statements per page, whatever its size.
 */

export const REVIEW_PAGE_SIZE = 30;

export type ReviewItem = {
  id: string;
  version: number;
  createdAt: Date;
  source: WorksiteSource;
  hasLocation: boolean;
  reviewFlags: ReviewFlag[];
  /** Hazards still blocking claims; empty once a coordinator reviewed them. */
  pendingHazards: Hazard[];
  addressText: string | null;
  notes: string | null;
};

export type ReviewPage = { items: ReviewItem[]; nextCursor: string | null };

type Row = {
  id: string;
  version: number;
  created_at: string;
  source: WorksiteSource;
  has_location: boolean;
  review_flags: string;
  pending_hazards: string;
  address_text: string | null;
  notes: string | null;
};

// Postgres returns enum arrays as their text form, `{a,b}`.
function parseArray(value: string): string[] {
  const inner = value.slice(1, -1);
  return inner === "" ? [] : inner.split(",");
}

/**
 * Keyset cursor over (created_at, id): stable while new homes keep arriving. It carries the
 * timestamp as the query prints it, in UTC with microseconds; a JS Date drops the microseconds
 * and the next page would start again from homes created in the same millisecond.
 */
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString().split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

export async function listWorksitesToReview(
  database: Executor,
  { emergencyId, viewerId, cursor }: { emergencyId: string; viewerId: string; cursor: string | null },
): Promise<ReviewPage> {
  const after = cursor ? decodeCursor(cursor) : null;
  return database.transaction(async (tx) => {
    const rows = await tx.execute<Row>(sql`
      SELECT
        w.id,
        w.version,
        -- ISO 8601 in UTC with microseconds: independent of the session's DateStyle and TimeZone.
        to_char(w.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at,
        w.source,
        w.location IS NOT NULL AS has_location,
        w.review_flags::text AS review_flags,
        (CASE WHEN w.hazards_reviewed_at IS NULL THEN w.hazards ELSE '{}' END)::text AS pending_hazards,
        c.address_text,
        c.notes
      FROM worksites w
      LEFT JOIN worksite_contacts c ON c.worksite_id = w.id
      WHERE w.emergency_id = ${emergencyId}
        AND (w.location IS NULL OR cardinality(w.review_flags) > 0
          OR (cardinality(w.hazards) > 0 AND w.hazards_reviewed_at IS NULL))
        ${after ? sql`AND (w.created_at, w.id) > (${after.createdAt}::timestamptz, ${after.id}::uuid)` : sql``}
      ORDER BY w.created_at, w.id
      LIMIT ${REVIEW_PAGE_SIZE + 1}
    `);
    const page = rows.slice(0, REVIEW_PAGE_SIZE);
    const viewed = page.filter((row) => row.address_text !== null || row.notes !== null).map((row) => row.id);
    if (viewed.length > 0) {
      await tx.execute(sql`
        INSERT INTO contact_views (emergency_id, user_id, worksite_id)
        SELECT ${emergencyId}, ${viewerId}, unnest(${sqlArray(viewed, "uuid")})
      `);
    }
    const items = page.map((row) => ({
      id: row.id,
      version: row.version,
      createdAt: new Date(row.created_at),
      source: row.source,
      hasLocation: row.has_location,
      reviewFlags: parseArray(row.review_flags) as ReviewFlag[],
      pendingHazards: parseArray(row.pending_hazards) as Hazard[],
      addressText: row.address_text,
      notes: row.notes,
    }));
    const last = page.at(-1);
    return {
      items,
      nextCursor: rows.length > REVIEW_PAGE_SIZE && last ? encodeCursor(last.created_at, last.id) : null,
    };
  });
}
