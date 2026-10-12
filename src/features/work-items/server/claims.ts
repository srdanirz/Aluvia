import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import { enqueueNotification } from "@/features/notifications";
import { worksiteAcceptsClaims } from "@/features/worksites/server";
import type { Database, Executor } from "@/shared/db/types";

import type { ClaimFailure, OwnClaimFailure, Result } from "../schemas";
import { recomputeUnclaimedSince } from "./unclaimed-since";

/**
 * Taking work and keeping it (issues #12, #13). Every decision is the WHERE of one conditional
 * UPDATE, never a read in TS (STYLEGUIDE, Concurrencia), and each write lands with its
 * work_item_events row, the home's unclaimed_since and its outbox notice in one transaction.
 * Callers check the session; these functions trust `userId` and let the database decide the rest.
 */

/**
 * What a volunteer acts on: one job, or a whole home (every job of it the action applies to). The
 * app acts on homes; a single job stays for coordinators' tools and tests.
 */
export type WorkTarget =
  { workItemId: string; worksiteId?: never } | { worksiteId: string; workItemId?: never };

// `now` is for tests only; without it every instant is the database's `now()` (see dbNow).
type WorkItemRef = WorkTarget & { emergencyId: string; userId: string; now?: Date };

export type ClaimedWorkItem = { worksiteId: string; workTypeKeys: string[]; expiresAt: Date };

const targetSql = (target: WorkTarget, alias?: string) => {
  const column = (name: string) => sql.raw(alias ? `${alias}.${name}` : name);
  return target.workItemId
    ? sql`${column("id")} = ${target.workItemId}::uuid`
    : sql`${column("worksite_id")} = ${target.worksiteId}::uuid`;
};

// Emergencies without a settings row hold a reservation this long; the column's default.
const DEFAULT_CLAIM_HOLD_MINUTES = 120;

const holdUntil = (emergencyId: string, now?: Date) => sql`
  ${dbNow(now)} + make_interval(mins => coalesce(
    (SELECT claim_hold_minutes FROM emergency_settings WHERE emergency_id = ${emergencyId}::uuid),
    ${DEFAULT_CLAIM_HOLD_MINUTES}))`;

const isOpenEmergencySql = (emergencyId: string) =>
  sql`EXISTS (SELECT 1 FROM emergencies e WHERE e.id = ${emergencyId}::uuid AND e.status = 'open')`;

const isMemberSql = (emergencyId: string, userId: string) => sql`EXISTS (
  SELECT 1 FROM emergency_members m WHERE m.emergency_id = ${emergencyId}::uuid AND m.user_id = ${userId}::uuid)`;

/**
 * "Voy para allá": claims the open jobs of a home (or one job) that nobody holds, or whose
 * reservation lapsed before the sweeper released it. Requires membership of an open emergency and
 * a home without an unreviewed "do not enter" risk. Each job goes to exactly one of many
 * concurrent callers; a caller who got none sees why.
 */
export async function claimWorkItem(
  db: Database,
  { emergencyId, userId, now, ...target }: WorkItemRef,
): Promise<Result<ClaimFailure, ClaimedWorkItem>> {
  const at = dbNow(now);
  const claimed = await db.transaction(async (tx) => {
    // The target CTE locks the rows, so the UPDATE below re-checks the latest committed versions.
    const rows = await tx.execute<{
      worksite_id: string;
      work_type_key: string;
      claim_expires_at: Date | string;
      previous_claimant: string | null;
      previous_claimed_at: Date | string | null;
      claimed_at: Date | string;
    }>(sql`
      WITH target AS (
        -- released_status: what the job reads once a lapsed hold is dropped. Progress statuses
        -- (partially done, needs follow-up) survive any number of claims and releases.
        SELECT id, status, claimed_by, claimed_at,
          CASE WHEN status = 'open_claimed' THEN 'open_unclaimed'::work_item_status ELSE status END AS released_status
        FROM work_items
        WHERE ${targetSql(target as WorkTarget)} AND emergency_id = ${emergencyId}::uuid
        ORDER BY id
        FOR UPDATE
      ), claimed AS (
        UPDATE work_items wi SET
          status = CASE WHEN t.released_status = 'open_unclaimed' THEN 'open_claimed'::work_item_status ELSE t.released_status END,
          claimed_by = ${userId}::uuid,
          claimed_at = ${at},
          claim_expires_at = ${holdUntil(emergencyId, now)},
          arrived_at = NULL,
          version = wi.version + 1,
          updated_at = ${at}
        FROM target t
        WHERE wi.id = t.id
          AND t.status::text LIKE 'open\\_%'
          -- Free, or held by a reservation that lapsed before the sweeper got to it. A claimant
          -- whose account was deleted leaves claimed_by null, so that job is free too.
          AND (t.claimed_by IS NULL OR wi.claim_expires_at <= ${at})
          AND ${isMemberSql(emergencyId, userId)}
          AND ${isOpenEmergencySql(emergencyId)}
          AND ${worksiteAcceptsClaims(sql`wi.worksite_id`)}
        RETURNING wi.id, wi.worksite_id, wi.work_type_key, wi.claim_expires_at, wi.claimed_at, wi.status AS to_status,
          t.status AS from_status, t.released_status,
          t.claimed_by AS previous_claimant, t.claimed_at AS previous_claimed_at
      ), events AS (
        INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
        SELECT id, ${emergencyId}::uuid, 'expired'::work_item_event_kind, from_status, released_status, NULL, ${at}
        FROM claimed WHERE previous_claimant IS NOT NULL
        UNION ALL
        SELECT id, ${emergencyId}::uuid, 'claimed'::work_item_event_kind, released_status, to_status, ${userId}::uuid, ${at}
        FROM claimed
      )
      SELECT worksite_id, work_type_key, claim_expires_at, claimed_at, previous_claimant, previous_claimed_at FROM claimed`);
    const [row] = rows;
    if (!row) return null;

    await recomputeUnclaimedSince(tx, { worksiteIds: [row.worksite_id], now });
    // The outbox schedules on the app clock; only claim decisions need the database's.
    const noticeAt = now ?? new Date();
    // One message per claim: someone heading to the home again another day is news again.
    await enqueueNotification(tx, {
      type: "work_item_claimed",
      emergencyId,
      eventKey: `work_item_claimed:${row.worksite_id}:${userId}:${new Date(row.claimed_at).toISOString()}`,
      params: { worksiteId: row.worksite_id },
      worksiteIds: [row.worksite_id],
      now: noticeAt,
    });
    // Whoever's lapsed hold this claim took over hears it once, whatever the number of jobs.
    const lapsed = [
      ...new Set(
        rows.flatMap((r) =>
          r.previous_claimant && r.previous_claimant !== userId ? [r.previous_claimant] : [],
        ),
      ),
    ];
    if (lapsed.length > 0) {
      await enqueueNotification(tx, {
        type: "work_item_claim_expired",
        emergencyId,
        eventKey: `work_item_claim_expired:${row.worksite_id}:${new Date(row.claimed_at).toISOString()}`,
        params: {},
        userIds: lapsed,
        now: noticeAt,
      });
    }
    return {
      worksiteId: row.worksite_id,
      workTypeKeys: rows.map((r) => r.work_type_key),
      expiresAt: new Date(row.claim_expires_at),
    };
  });
  if (claimed) return { ok: true, data: claimed };
  return { ok: false, code: await explainClaimFailure(db, emergencyId, userId, target as WorkTarget) };
}

/**
 * Why a claim did not land. Read after the fact only to pick the code the person sees; the
 * decision was already the UPDATE's. Precedence matches what the person can do about it.
 */
async function explainClaimFailure(
  db: Database,
  emergencyId: string,
  userId: string,
  target: WorkTarget,
): Promise<ClaimFailure> {
  const [row] = await db.execute<{
    is_member: boolean;
    is_open: boolean;
    accepts: boolean;
  }>(sql`
    SELECT ${isMemberSql(emergencyId, userId)} AS is_member,
      bool_or(wi.status::text LIKE 'open\\_%') AND bool_and(e.status = 'open') AS is_open,
      bool_and(${worksiteAcceptsClaims(sql`wi.worksite_id`)}) AS accepts
    FROM work_items wi JOIN emergencies e ON e.id = wi.emergency_id
    WHERE ${targetSql(target, "wi")} AND wi.emergency_id = ${emergencyId}::uuid
    HAVING count(*) > 0`);
  if (!row) return "not_found";
  if (!row.is_member) return "not_member";
  if (!row.is_open) return "not_open";
  if (!row.accepts) return "hazard_unreviewed";
  return "already_claimed";
}

/** A closed emergency stops every change; otherwise the job is simply no longer the caller's. */
async function explainOwnClaimFailure(db: Executor, emergencyId: string) {
  const [row] = await db.execute<{ is_open: boolean }>(
    sql`SELECT ${isOpenEmergencySql(emergencyId)} AS is_open`,
  );
  return row?.is_open ? ("claim_lost" as const) : ("emergency_closed" as const);
}

/** "Sigo en camino": pushes the caller's live reservation forward by the emergency's hold. */
export async function renewWorkItemClaim(
  db: Database,
  { emergencyId, userId, now, ...target }: WorkItemRef,
): Promise<Result<OwnClaimFailure, { expiresAt: Date }>> {
  const at = dbNow(now);
  const [row] = await db.execute<{ claim_expires_at: Date | string }>(sql`
    WITH renewed AS (
      UPDATE work_items SET claim_expires_at = ${holdUntil(emergencyId, now)}, updated_at = ${at}
      WHERE ${targetSql(target as WorkTarget)} AND emergency_id = ${emergencyId}::uuid AND claimed_by = ${userId}::uuid
        AND claim_expires_at > ${at} AND ${isOpenEmergencySql(emergencyId)}
      RETURNING id, status, claim_expires_at
    ), events AS (
      INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
      SELECT id, ${emergencyId}::uuid, 'renewed'::work_item_event_kind, status, status, ${userId}::uuid, ${at} FROM renewed
    )
    SELECT claim_expires_at FROM renewed LIMIT 1`);
  if (row) return { ok: true, data: { expiresAt: new Date(row.claim_expires_at) } };
  return { ok: false, code: await explainOwnClaimFailure(db, emergencyId) };
}

/**
 * "Llegué": the volunteer is on site, so the reservation stops expiring. Accepted while the claim
 * is still theirs, even a few minutes past its expiry if nobody took it meanwhile.
 */
export async function markWorkItemArrived(
  db: Database,
  { emergencyId, userId, now, ...target }: WorkItemRef,
): Promise<Result<OwnClaimFailure, { workTypeKeys: string[] }>> {
  const at = dbNow(now);
  const rows = await db.execute<{ work_type_key: string }>(sql`
    WITH arrived AS (
      UPDATE work_items SET arrived_at = ${at}, claim_expires_at = NULL,
        version = version + 1, updated_at = ${at}
      WHERE ${targetSql(target as WorkTarget)} AND emergency_id = ${emergencyId}::uuid AND claimed_by = ${userId}::uuid
        AND status::text LIKE 'open\\_%' AND arrived_at IS NULL AND ${isOpenEmergencySql(emergencyId)}
      RETURNING id, status, work_type_key
    ), events AS (
      INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
      SELECT id, ${emergencyId}::uuid, 'arrived'::work_item_event_kind, status, status, ${userId}::uuid, ${at} FROM arrived
    )
    SELECT work_type_key FROM arrived`);
  if (rows.length > 0) return { ok: true, data: { workTypeKeys: rows.map((row) => row.work_type_key) } };
  return { ok: false, code: await explainOwnClaimFailure(db, emergencyId) };
}

/** "Ya no voy": gives the work back. A progress status (partially done, needs follow-up) stays. */
export async function releaseWorkItem(
  db: Database,
  { emergencyId, userId, now, ...target }: WorkItemRef,
): Promise<Result<OwnClaimFailure>> {
  const at = dbNow(now);
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ worksite_id: string }>(sql`
      WITH released AS (
        UPDATE work_items wi SET
          status = CASE WHEN wi.status = 'open_claimed' THEN 'open_unclaimed'::work_item_status ELSE wi.status END,
          claimed_by = NULL, claimed_at = NULL, claim_expires_at = NULL, arrived_at = NULL,
          version = wi.version + 1, updated_at = ${at}
        FROM (SELECT id, status FROM work_items WHERE ${targetSql(target as WorkTarget)} ORDER BY id FOR UPDATE) t
        WHERE wi.id = t.id AND wi.emergency_id = ${emergencyId}::uuid AND wi.claimed_by = ${userId}::uuid
          AND wi.status::text LIKE 'open\\_%' AND ${isOpenEmergencySql(emergencyId)}
        RETURNING wi.id, wi.worksite_id, t.status AS from_status, wi.status AS to_status
      ), events AS (
        INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
        SELECT id, ${emergencyId}::uuid, 'released'::work_item_event_kind, from_status, to_status, ${userId}::uuid, ${at} FROM released
      )
      SELECT worksite_id FROM released LIMIT 1`);
    if (!row) return { ok: false, code: await explainOwnClaimFailure(tx, emergencyId) } as const;
    await recomputeUnclaimedSince(tx, { worksiteIds: [row.worksite_id], now });
    return { ok: true, data: null } as const;
  });
}
