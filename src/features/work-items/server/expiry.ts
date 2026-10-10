import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import { enqueueNotification } from "@/features/notifications";
import type { Database } from "@/shared/db/types";

import { claimsExpired } from "./metrics";
import { recomputeUnclaimedSince } from "./unclaimed-since";

// Rows per round: one emergency's lapsed reservations, bounded so a round is a short transaction.
const SWEEP_BATCH = 200;

/**
 * Releases every lapsed "Voy para allá" reservation (issue #12): unclaimed again (a progress
 * status such as partially done stays), an
 * `expired` event, the home red again, and one notice per volunteer. Rounds take one emergency at
 * a time with FOR UPDATE SKIP LOCKED, so two sweepers never block each other and a concurrent claim
 * of the same row (which also accepts lapsed reservations) wins or waits cleanly.
 * Stops at `deadline`; the scheduler calls again next minute. Returns how many it released.
 */
export async function releaseExpiredClaims(
  db: Database,
  // `now` is for tests only: expiry is decided on the database clock (dbNow). The deadline is
  // a time budget for this request, so the app clock is right for it.
  { deadline, now }: { deadline: Date; now?: Date },
): Promise<number> {
  const round = async (released: number): Promise<number> => {
    if (Date.now() >= deadline.getTime()) return released;
    const count = await releaseRound(db, now);
    claimsExpired.add(count);
    // Another round while rounds find work: the next one may be another emergency's backlog.
    return count > 0 ? round(released + count) : released;
  };
  return round(0);
}

async function releaseRound(db: Database, now?: Date): Promise<number> {
  const at = dbNow(now);
  return db.transaction(async (tx) => {
    const rows = await tx.execute<{
      emergency_id: string;
      worksite_id: string;
      previous_claimant: string | null;
      swept_at: string;
    }>(sql`
      WITH emergency AS (
        -- Skips rows another sweeper or a claim holds, so a locked backlog never stalls the rest,
        -- and closed emergencies: nothing changes in one (their holds simply stay as they were).
        SELECT wi.emergency_id FROM work_items wi
        JOIN emergencies e ON e.id = wi.emergency_id AND e.status = 'open'
        WHERE wi.claim_expires_at <= ${at}
        ORDER BY wi.claim_expires_at LIMIT 1
        FOR UPDATE OF wi SKIP LOCKED
      ), expired AS (
        SELECT wi.id, wi.claimed_by, wi.status FROM work_items wi
        WHERE wi.emergency_id = (SELECT emergency_id FROM emergency) AND wi.claim_expires_at <= ${at}
        ORDER BY wi.claim_expires_at
        LIMIT ${SWEEP_BATCH}
        FOR UPDATE SKIP LOCKED
      ), released AS (
        UPDATE work_items wi SET
          status = CASE WHEN wi.status = 'open_claimed' THEN 'open_unclaimed'::work_item_status ELSE wi.status END,
          claimed_by = NULL, claimed_at = NULL,
          claim_expires_at = NULL, version = wi.version + 1, updated_at = ${at}
        FROM expired x
        WHERE wi.id = x.id
        RETURNING wi.id, wi.emergency_id, wi.worksite_id, x.claimed_by AS previous_claimant,
          x.status AS from_status, wi.status AS to_status
      ), events AS (
        INSERT INTO work_item_events (work_item_id, emergency_id, kind, from_status, to_status, actor_id, created_at)
        SELECT id, emergency_id, 'expired'::work_item_event_kind, from_status, to_status, NULL, ${at}
        FROM released
      )
      SELECT emergency_id, worksite_id, previous_claimant, to_char((${at}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS swept_at
      FROM released`);
    const first = rows[0];
    if (!first) return 0;

    await recomputeUnclaimedSince(tx, { worksiteIds: [...new Set(rows.map((r) => r.worksite_id))], now });
    await enqueueNotification(tx, {
      type: "work_item_claim_expired",
      emergencyId: first.emergency_id,
      // One notice per volunteer and sweep, however many of their reservations lapsed in it.
      eventKey: `work_item_claim_expired:sweep:${first.emergency_id}:${first.swept_at}`,
      params: {},
      // A claimant whose account was deleted left no one to tell.
      userIds: [...new Set(rows.flatMap((r) => (r.previous_claimant ? [r.previous_claimant] : [])))],
      now: now ?? new Date(),
    });
    return rows.length;
  });
}
