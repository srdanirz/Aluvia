import "server-only";

import { sql } from "drizzle-orm";

import { worksiteAcceptsClaims } from "@/features/worksites/server";
import type { workItemStatus } from "@/shared/db/schema";
import type { Executor } from "@/shared/db/types";
import { decodeTimeCursor, encodeTimeCursor, type Page, pageOf } from "@/shared/lib/pagination";

type WorkItemStatus = (typeof workItemStatus.enumValues)[number];

// Distance is shown to the nearest 100 m: finer reads as noise to someone walking there.
const DISTANCE_STEP_METERS = 100;
// The help list is read on a phone: a short first page loads fast on a weak signal.
const HELP_PAGE_SIZE = 20;
// Nobody holds more open jobs than this; the cap only keeps the query bounded.
const MY_WORK_LIMIT = 100;

/** Localized work type name, falling back to the emergency's default language, then the key. */
const workTypeName = (locale: string) =>
  sql`coalesce(wt.name ->> ${locale}, wt.name ->> e.default_locale, wt.key)`;

export type HelpWorksite = {
  worksiteId: string;
  /** Since when nobody is on it: the list's order, oldest first. */
  waitingSince: Date;
  /** Rounded to DISTANCE_STEP_METERS from the viewer's position; null without one or without a pin. */
  distanceMeters: number | null;
  damageLevel: "minor" | "moderate" | "severe" | "uninhabitable" | null;
  /** A "do not enter" risk nobody reviewed yet: shown, but nobody can take its jobs (feat/report). */
  isBlocked: boolean;
  /** Open jobs nobody holds, in catalog order: the concrete action is taking the first one. */
  workItems: { id: string; workType: string }[];
};

/**
 * "Dónde ayudar ahora" (issue #10): the emergency's abandoned homes, longest waiting first, with
 * the jobs a volunteer can take right now. One query per page whatever its size, served by
 * worksites_emergency_id_unclaimed_since_idx. Public form: no contact data, no vulnerability.
 */
export async function listWorksitesToHelp(
  db: Executor,
  {
    emergencyId,
    locale,
    origin,
    cursor,
  }: { emergencyId: string; locale: string; origin?: { lat: number; lng: number }; cursor?: string },
): Promise<Page<HelpWorksite>> {
  const after = decodeTimeCursor(cursor);
  const originPoint = origin
    ? sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography`
    : null;
  const rows = await db.execute<{
    id: string;
    unclaimed_since: Date | string;
    cursor_at: string;
    distance: number | null;
    damage_level: HelpWorksite["damageLevel"];
    is_blocked: boolean;
    work_items: HelpWorksite["workItems"] | null;
  }>(sql`
    SELECT w.id, w.unclaimed_since, w.unclaimed_since::text AS cursor_at, w.damage_level,
      ${
        originPoint
          ? sql`(round(ST_Distance(w.location::geography, ${originPoint}) / ${DISTANCE_STEP_METERS}) * ${DISTANCE_STEP_METERS})::int`
          : sql`NULL::int`
      } AS distance,
      NOT ${worksiteAcceptsClaims(sql`w.id`)} AS is_blocked,
      items.work_items
    FROM worksites w
    JOIN emergencies e ON e.id = w.emergency_id
    CROSS JOIN LATERAL (
      SELECT json_agg(json_build_object('id', wi.id, 'workType', ${workTypeName(locale)})
        ORDER BY wt.sort_order, wt.key, wi.id) AS work_items
      FROM work_items wi
      JOIN work_types wt ON wt.emergency_id = wi.emergency_id AND wt.key = wi.work_type_key
      WHERE wi.worksite_id = w.id AND wi.emergency_id = w.emergency_id
        AND wi.claimed_by IS NULL AND wi.status::text LIKE 'open\\_%'
    ) items
    WHERE w.emergency_id = ${emergencyId}::uuid AND w.unclaimed_since IS NOT NULL
      ${after ? sql`AND (w.unclaimed_since, w.id) > (${after[0]}::timestamptz, ${after[1]}::uuid)` : sql``}
    ORDER BY w.unclaimed_since, w.id
    LIMIT ${HELP_PAGE_SIZE + 1}`);
  const page = pageOf(rows, (last) => encodeTimeCursor(last.cursor_at, last.id), HELP_PAGE_SIZE);
  return {
    items: page.items.map((row) => ({
      worksiteId: row.id,
      waitingSince: new Date(row.unclaimed_since),
      distanceMeters: row.distance,
      damageLevel: row.damage_level,
      isBlocked: row.is_blocked,
      workItems: row.work_items ?? [],
    })),
    nextCursor: page.nextCursor,
  };
}

export type MyWorkItem = {
  id: string;
  worksiteId: string;
  workType: string;
  status: WorkItemStatus;
  version: number;
  /** When the reservation lapses; null once the volunteer arrived. */
  expiresAt: Date | null;
  arrivedAt: Date | null;
};

/** The open jobs the volunteer holds in the emergency, the ones about to lapse first. One query. */
export async function listMyWorkItems(
  db: Executor,
  { emergencyId, userId, locale }: { emergencyId: string; userId: string; locale: string },
): Promise<MyWorkItem[]> {
  const rows = await db.execute<{
    id: string;
    worksite_id: string;
    work_type: string;
    status: WorkItemStatus;
    version: number;
    claim_expires_at: Date | string | null;
    arrived_at: Date | string | null;
  }>(sql`
    SELECT wi.id, wi.worksite_id, ${workTypeName(locale)} AS work_type, wi.status, wi.version,
      wi.claim_expires_at, wi.arrived_at
    FROM work_items wi
    JOIN emergencies e ON e.id = wi.emergency_id
    JOIN work_types wt ON wt.emergency_id = wi.emergency_id AND wt.key = wi.work_type_key
    WHERE wi.emergency_id = ${emergencyId}::uuid AND wi.claimed_by = ${userId}::uuid
      AND wi.status::text LIKE 'open\\_%'
    ORDER BY wi.claim_expires_at NULLS LAST, wi.claimed_at, wi.id
    LIMIT ${MY_WORK_LIMIT}`);
  return rows.map((row) => ({
    id: row.id,
    worksiteId: row.worksite_id,
    workType: row.work_type,
    status: row.status,
    version: row.version,
    expiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : null,
    arrivedAt: row.arrived_at ? new Date(row.arrived_at) : null,
  }));
}

export type WorksiteJob = {
  id: string;
  workType: string;
  status: WorkItemStatus;
  version: number;
  isMine: boolean;
  isClaimed: boolean;
  expiresAt: Date | null;
  arrivedAt: Date | null;
  isVerified: boolean;
  /** The home has an unreviewed "do not enter" risk: nobody can take this job yet. */
  isBlocked: boolean;
};

/**
 * One home's jobs for a signed-in member: what they can take, what is theirs and, for coordinators,
 * what to verify. Never says who holds a job, only whether it is the viewer. One query.
 */
export async function listWorksiteJobs(
  db: Executor,
  {
    emergencyId,
    worksiteId,
    userId,
    locale,
  }: { emergencyId: string; worksiteId: string; userId: string; locale: string },
): Promise<WorksiteJob[]> {
  const rows = await db.execute<{
    id: string;
    work_type: string;
    status: WorkItemStatus;
    version: number;
    is_mine: boolean;
    is_claimed: boolean;
    claim_expires_at: Date | string | null;
    arrived_at: Date | string | null;
    is_verified: boolean;
    is_blocked: boolean;
  }>(sql`
    SELECT wi.id, ${workTypeName(locale)} AS work_type, wi.status, wi.version,
      NOT ${worksiteAcceptsClaims(sql`wi.worksite_id`)} AS is_blocked,
      wi.claimed_by IS NOT DISTINCT FROM ${userId}::uuid AS is_mine,
      wi.claimed_by IS NOT NULL AS is_claimed,
      CASE WHEN wi.claimed_by = ${userId}::uuid THEN wi.claim_expires_at END AS claim_expires_at,
      CASE WHEN wi.claimed_by = ${userId}::uuid THEN wi.arrived_at END AS arrived_at,
      wi.verified_at IS NOT NULL AS is_verified
    FROM work_items wi
    JOIN emergencies e ON e.id = wi.emergency_id
    JOIN work_types wt ON wt.emergency_id = wi.emergency_id AND wt.key = wi.work_type_key
    WHERE wi.emergency_id = ${emergencyId}::uuid AND wi.worksite_id = ${worksiteId}::uuid
    ORDER BY wt.sort_order, wt.key, wi.id`);
  return rows.map((row) => ({
    id: row.id,
    workType: row.work_type,
    status: row.status,
    version: row.version,
    isMine: row.is_mine,
    isClaimed: row.is_claimed,
    expiresAt: row.claim_expires_at ? new Date(row.claim_expires_at) : null,
    arrivedAt: row.arrived_at ? new Date(row.arrived_at) : null,
    isVerified: row.is_verified,
    isBlocked: row.is_blocked,
  }));
}

/** The emergency's supply names in the viewer's language, by key; to show what a home is missing. */
export async function listSupplyNames(
  db: Executor,
  { emergencyId, locale }: { emergencyId: string; locale: string },
): Promise<Record<string, string>> {
  const rows = await db.execute<{ key: string; name: string }>(sql`
    SELECT st.key, coalesce(st.name ->> ${locale}, st.name ->> e.default_locale, st.key) AS name
    FROM supply_types st JOIN emergencies e ON e.id = st.emergency_id
    WHERE st.emergency_id = ${emergencyId}::uuid`);
  return Object.fromEntries(rows.map((row) => [row.key, row.name]));
}
