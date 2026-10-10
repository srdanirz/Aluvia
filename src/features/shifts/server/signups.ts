import "server-only";

import { sql } from "drizzle-orm";

import { dbNow } from "@/shared/db/clock";

import { cancelPendingNotifications, enqueueNotification } from "@/features/notifications";
import type { Database } from "@/shared/db/types";

import type { CancelFailure, SignUpFailure } from "../schemas";

/**
 * Signing up for a shift and cancelling it, in the order STYLEGUIDE (Concurrencia) fixes: the
 * sign-up row first (its partial unique index makes a double tap a no-op), then the seat with
 * `filled < capacity` in the same UPDATE, rolled back if the shift is full. `filled` moves only here.
 */

// `now` is for tests only; otherwise the database clock (dbNow) decides.
type SignUpInput = { emergencyId: string; shiftId: string; userId: string; now?: Date };
type Outcome<Code extends string> = { ok: true } | { ok: false; code: Code };

// Thrown inside the transaction to roll the sign-up row back when no seat was left.
class ShiftFull extends Error {}

const ACTIVE_SIGNUP = sql`(shift_id, user_id) WHERE cancelled_at IS NULL`;

export async function signUpForShift(
  db: Database,
  { emergencyId, shiftId, userId, now }: SignUpInput,
): Promise<Outcome<SignUpFailure>> {
  const at = dbNow(now);
  try {
    const signedUp = await db.transaction(async (tx) => {
      const [signup] = await tx.execute<{ id: string }>(sql`
        INSERT INTO shift_signups (shift_id, user_id, created_at)
        SELECT s.id, ${userId}::uuid, ${at}
        FROM shifts s JOIN emergencies e ON e.id = s.emergency_id
        WHERE s.id = ${shiftId}::uuid AND s.emergency_id = ${emergencyId}::uuid
          AND e.status = 'open' AND s.starts_at > ${at}
          AND EXISTS (SELECT 1 FROM emergency_members m WHERE m.emergency_id = ${emergencyId}::uuid AND m.user_id = ${userId}::uuid)
        ON CONFLICT ${ACTIVE_SIGNUP} DO NOTHING
        RETURNING id`);
      if (!signup) return null;

      const [seat] = await tx.execute<{ starts_at: Date | string; remind_at: Date | string }>(sql`
        UPDATE shifts s SET filled = s.filled + 1, version = s.version + 1
        FROM emergencies e
        WHERE s.id = ${shiftId}::uuid AND e.id = s.emergency_id AND s.filled < s.capacity
        RETURNING s.starts_at, greatest(${at}, ${reminderAt}) AS remind_at`);
      if (!seat) throw new ShiftFull();

      await enqueueNotification(tx, {
        type: "shift_reminder",
        emergencyId,
        eventKey: reminderKey(signup.id),
        params: { shiftId, startsAt: new Date(seat.starts_at).toISOString() },
        userIds: [userId],
        now: now ?? new Date(),
        notBefore: new Date(seat.remind_at),
      });
      return signup.id;
    });
    if (signedUp) return { ok: true };
  } catch (error) {
    if (error instanceof ShiftFull) return { ok: false, code: "shift_full" };
    throw error;
  }
  return { ok: false, code: await explainSignUpFailure(db, { emergencyId, shiftId, userId, now }) };
}

/**
 * ADR 0007: two hours before, or 20:00 the evening before when the shift starts before 10:00 in
 * the emergency's time zone, so nobody is woken up by it. Evaluated inside the seat UPDATE.
 */
const reminderAt = sql`CASE
  WHEN extract(hour FROM s.starts_at AT TIME ZONE e.time_zone) < 10
  THEN (((s.starts_at AT TIME ZONE e.time_zone)::date - 1) + time '20:00') AT TIME ZONE e.time_zone
  ELSE s.starts_at - interval '2 hours'
END`;

const reminderKey = (signupId: string) => `shift_reminder:${signupId}`;

async function explainSignUpFailure(
  db: Database,
  { emergencyId, shiftId, userId }: SignUpInput,
): Promise<SignUpFailure> {
  const [row] = await db.execute<{
    is_member: boolean;
    is_emergency_open: boolean;
    is_signed_up: boolean;
  }>(sql`
    SELECT e.status = 'open' AS is_emergency_open,
      EXISTS (SELECT 1 FROM emergency_members m WHERE m.emergency_id = ${emergencyId}::uuid AND m.user_id = ${userId}::uuid) AS is_member,
      EXISTS (SELECT 1 FROM shift_signups x WHERE x.shift_id = s.id AND x.user_id = ${userId}::uuid AND x.cancelled_at IS NULL) AS is_signed_up
    FROM shifts s JOIN emergencies e ON e.id = s.emergency_id
    WHERE s.id = ${shiftId}::uuid AND s.emergency_id = ${emergencyId}::uuid`);
  if (!row) return "not_found";
  if (!row.is_emergency_open) return "emergency_closed";
  if (!row.is_member) return "not_member";
  if (row.is_signed_up) return "already_signed_up";
  return "shift_started";
}

/** Gives the seat back before the shift starts and withdraws its pending reminder. */
export async function cancelShiftSignup(
  db: Database,
  { emergencyId, shiftId, userId, now }: SignUpInput,
): Promise<Outcome<CancelFailure>> {
  const at = dbNow(now);
  return db.transaction(async (tx) => {
    const [cancelled] = await tx.execute<{ id: string }>(sql`
      UPDATE shift_signups x SET cancelled_at = ${at}
      FROM shifts s
      WHERE x.shift_id = ${shiftId}::uuid AND x.user_id = ${userId}::uuid AND x.cancelled_at IS NULL
        AND s.id = x.shift_id AND s.emergency_id = ${emergencyId}::uuid AND s.starts_at > ${at}
      RETURNING x.id`);
    if (!cancelled) return { ok: false, code: "not_signed_up" } as const;
    await tx.execute(
      sql`UPDATE shifts SET filled = filled - 1, version = version + 1 WHERE id = ${shiftId}::uuid`,
    );
    await cancelPendingNotifications(tx, { eventKey: reminderKey(cancelled.id), now: now ?? new Date() });
    return { ok: true } as const;
  });
}
