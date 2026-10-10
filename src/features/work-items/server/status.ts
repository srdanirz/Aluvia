import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import { enqueueNotification } from "@/features/notifications";
import type { Database } from "@/shared/db/types";

import {
  COORDINATOR_ONLY_STATUSES,
  type MarkableStatus,
  type MarkStatusFailure,
  type Result,
} from "../schemas";
import { recomputeUnclaimedSince } from "./unclaimed-since";

type StatusChange = {
  emergencyId: string;
  workItemId: string;
  userId: string;
  // The version the person was looking at: a coordinator never overwrites another write silently.
  version: number;
  // Tests only; otherwise the database's now() (dbNow).
  now?: Date;
};

const isCoordinatorSql = (emergencyId: string, userId: string) => sql`EXISTS (
  SELECT 1 FROM emergency_members m
  WHERE m.emergency_id = ${emergencyId}::uuid AND m.user_id = ${userId}::uuid
    AND m.role = 'coordinator' AND m.approved_at IS NOT NULL)`;

/**
 * Terminé, Avancé, Necesita más ayuda and the other closings (issue #13). Allowed to whoever holds
 * the claim and to the emergency's coordinators; `closed_duplicate` to coordinators only. Only open
 * work changes. "Needs follow-up" gives the claim back, so the home turns red again and its
 * coordinators get a notice; partial progress keeps the claim and stops its expiry.
 */
export async function markWorkItemStatus(
  db: Database,
  { emergencyId, workItemId, userId, version, now, status }: StatusChange & { status: MarkableStatus },
): Promise<Result<MarkStatusFailure, { workTypeKey: string; isCoordinator: boolean }>> {
  const at = dbNow(now);
  const allowed = COORDINATOR_ONLY_STATUSES.includes(status)
    ? isCoordinatorSql(emergencyId, userId)
    : sql`(t.claimed_by = ${userId}::uuid OR ${isCoordinatorSql(emergencyId, userId)})`;

  const changed = await db.transaction(async (tx) => {
    const [row] = await tx.execute<{
      worksite_id: string;
      work_type_key: string;
      is_coordinator: boolean;
    }>(sql`
      WITH target AS (
        SELECT id, status, claimed_by FROM work_items
        WHERE id = ${workItemId}::uuid AND emergency_id = ${emergencyId}::uuid
        FOR UPDATE
      ), marked AS (
        UPDATE work_items wi SET
          status = ${status},
          claimed_by = CASE WHEN ${status} = 'open_needs_follow_up' THEN NULL ELSE wi.claimed_by END,
          claimed_at = CASE WHEN ${status} = 'open_needs_follow_up' THEN NULL ELSE wi.claimed_at END,
          -- The claimant reporting progress is there: the job stops expiring and shows its on-site
          -- buttons. A coordinator's report from afar leaves the volunteer's hold as it was.
          arrived_at = CASE
            WHEN ${status} = 'open_needs_follow_up' THEN NULL
            WHEN wi.claimed_by = ${userId}::uuid THEN coalesce(wi.arrived_at, ${at})
            ELSE wi.arrived_at
          END,
          claim_expires_at = CASE
            WHEN ${status} = 'open_partially_done' AND wi.claimed_by IS DISTINCT FROM ${userId}::uuid
            THEN wi.claim_expires_at
          END,
          -- A verification vouches for the status it saw, not for the next one.
          verified_at = NULL,
          verified_by = NULL,
          version = wi.version + 1,
          updated_at = ${at}
        FROM target t
        WHERE wi.id = t.id AND wi.version = ${version} AND t.status::text LIKE 'open\\_%' AND ${allowed}
          AND EXISTS (SELECT 1 FROM emergencies e WHERE e.id = ${emergencyId}::uuid AND e.status = 'open')
        RETURNING wi.id, wi.worksite_id, wi.work_type_key, t.status AS from_status
      ), events AS (
        INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
        SELECT id, ${emergencyId}::uuid, 'status_changed'::work_item_event_kind, from_status, ${status}::work_item_status, ${userId}::uuid, ${at} FROM marked
      )
      SELECT worksite_id, work_type_key, ${isCoordinatorSql(emergencyId, userId)} AS is_coordinator FROM marked`);
    if (!row) return null;

    await recomputeUnclaimedSince(tx, { worksiteIds: [row.worksite_id], now });
    if (status === "open_needs_follow_up") {
      const coordinators = await tx.execute<{ user_id: string }>(sql`
        SELECT user_id FROM emergency_members
        WHERE emergency_id = ${emergencyId}::uuid AND role = 'coordinator' AND approved_at IS NOT NULL`);
      await enqueueNotification(tx, {
        type: "work_item_needs_follow_up",
        emergencyId,
        eventKey: `work_item_needs_follow_up:${workItemId}:${version + 1}`,
        params: { worksiteId: row.worksite_id },
        userIds: coordinators.map((c) => c.user_id).filter((id) => id !== userId),
        // The outbox schedules on the app clock; only the status decision needs the database's.
        now: now ?? new Date(),
      });
    }
    return { workTypeKey: row.work_type_key, isCoordinator: row.is_coordinator };
  });
  if (changed) return { ok: true, data: changed };
  return {
    ok: false,
    code: await explainStatusFailure(db, { emergencyId, workItemId, userId, version, now }, status),
  };
}

/** "Verificado en terreno" (issue #13, after #Verificado19S): a coordinator confirms the status they see. */
export async function verifyWorkItem(
  db: Database,
  { emergencyId, workItemId, userId, version, now }: StatusChange,
): Promise<Result<MarkStatusFailure>> {
  const at = dbNow(now);
  const [row] = await db.execute(sql`
    WITH verified AS (
      UPDATE work_items SET verified_at = ${at}, verified_by = ${userId}::uuid,
        version = version + 1, updated_at = ${at}
      WHERE id = ${workItemId}::uuid AND emergency_id = ${emergencyId}::uuid AND version = ${version}
        AND ${isCoordinatorSql(emergencyId, userId)}
        AND EXISTS (SELECT 1 FROM emergencies e WHERE e.id = ${emergencyId}::uuid AND e.status = 'open')
      RETURNING id, status
    ), events AS (
      INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
      SELECT id, ${emergencyId}::uuid, 'verified'::work_item_event_kind, status, status, ${userId}::uuid, ${at} FROM verified
    )
    SELECT id FROM verified`);
  if (row) return { ok: true, data: null };
  return {
    ok: false,
    code: await explainStatusFailure(db, { emergencyId, workItemId, userId, version, now }, null),
  };
}

/** Picks the code for a refused change; the UPDATE already decided. */
async function explainStatusFailure(
  db: Database,
  { emergencyId, workItemId, userId, version }: StatusChange,
  status: MarkableStatus | null,
): Promise<MarkStatusFailure> {
  const [row] = await db.execute<{
    version: number;
    is_open: boolean;
    claimed_by: string | null;
    is_coordinator: boolean;
    is_emergency_open: boolean;
  }>(sql`
    SELECT version, status::text LIKE 'open\\_%' AS is_open, claimed_by,
      EXISTS (SELECT 1 FROM emergencies e WHERE e.id = ${emergencyId}::uuid AND e.status = 'open') AS is_emergency_open,
      ${isCoordinatorSql(emergencyId, userId)} AS is_coordinator
    FROM work_items WHERE id = ${workItemId}::uuid AND emergency_id = ${emergencyId}::uuid`);
  if (!row) return "not_found";
  if (!row.is_emergency_open) return "emergency_closed";
  const mayAct =
    row.is_coordinator ||
    (status !== null && !COORDINATOR_ONLY_STATUSES.includes(status) && row.claimed_by === userId);
  if (!mayAct) return "forbidden";
  if (status !== null && !row.is_open) return "not_open";
  if (row.version !== version) return "stale_version";
  return "not_open";
}
