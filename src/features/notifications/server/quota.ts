import { sql } from "drizzle-orm";

import type { Executor, Transaction } from "@/shared/db/types";

import type { ClaimedNotification } from "./claim";
import { fallBackToSms } from "./fallback";

/**
 * The daily cap on SMS and WhatsApp per emergency (ADR 0007, Costos). A paid message reserves its
 * slot when claimed, under a row lock on `notification_daily_usage`, so two workers cannot both take
 * the last one; a message that then fails gives its slot back. A worker that dies mid-batch keeps
 * its slots until local midnight: the cap errs toward spending less, never more.
 *
 * The reserve: volunteers and coordinators stop where only `neighbor_reserve` slots remain unused by
 * neighbors, because they still have push and email and neighbors have nothing else.
 */

export const PAID_CHANNELS = ["sms", "whatsapp"] as const;

export type Usage = { userCount: number; neighborCount: number; cap: number; reserve: number };
type Request = { id: string; key: string; isNeighbor: boolean };

/** Grants requests in order, neighbors first, against usage keyed by emergency, channel and day. */
export function allocatePaidMessages(usage: Map<string, Usage>, requests: Request[]) {
  const next = new Map([...usage].map(([key, value]) => [key, { ...value }]));
  const granted: string[] = [];
  const denied: string[] = [];
  const ordered = [...requests].sort((a, b) => Number(b.isNeighbor) - Number(a.isNeighbor));
  for (const request of ordered) {
    const current = next.get(request.key);
    const total = current ? current.userCount + current.neighborCount : 0;
    const heldForNeighbors = current ? Math.max(0, current.reserve - current.neighborCount) : 0;
    const limit = request.isNeighbor ? (current?.cap ?? 0) : (current?.cap ?? 0) - heldForNeighbors;
    if (!current || total >= limit) {
      denied.push(request.id);
      continue;
    }
    if (request.isNeighbor) current.neighborCount += 1;
    else current.userCount += 1;
    granted.push(request.id);
  }
  return { granted, denied, usage: next };
}

const usageKey = (n: Pick<ClaimedNotification, "emergencyId" | "channel" | "localDay">) =>
  `${n.emergencyId}|${n.channel}|${n.localDay}`;

const isPaid = (n: ClaimedNotification) => (PAID_CHANNELS as readonly string[]).includes(n.channel);

/**
 * Reserves cap slots for the paid rows just claimed, inside the claim transaction. Denied rows are
 * closed with `daily_cap_reached`, a denied WhatsApp falls back to SMS, and a neighbor denied on
 * every channel stays in the list the coordinator calls by phone.
 * Returns the rows that may be sent. A fixed number of statements, whatever the batch size.
 */
export async function reservePaidMessages(tx: Transaction, claimed: ClaimedNotification[], now: Date) {
  const paid = claimed.filter(isPaid);
  if (paid.length === 0) return claimed;

  // Sorted, so concurrent workers insert and lock usage rows in the same order and cannot deadlock.
  const keys = [...new Map(paid.map((n) => [usageKey(n), n])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, n]) => n);
  const keyValues = sql.join(
    keys.map((n) => sql`(${n.emergencyId}::uuid, ${n.channel}::notification_channel, ${n.localDay}::date)`),
    sql`, `,
  );
  await tx.execute(sql`
    INSERT INTO notification_daily_usage (emergency_id, channel, day)
    VALUES ${keyValues}
    ON CONFLICT DO NOTHING`);
  const rows = await tx.execute<{
    emergencyId: string;
    channel: string;
    day: string;
    userCount: number;
    neighborCount: number;
    cap: number;
    reserve: number;
  }>(sql`
    SELECT u.emergency_id AS "emergencyId", u.channel, to_char(u.day, 'YYYY-MM-DD') AS day,
      u.user_count AS "userCount", u.neighbor_count AS "neighborCount",
      CASE u.channel WHEN 'sms' THEN COALESCE(s.sms_daily_cap, 0) ELSE COALESCE(s.whatsapp_daily_cap, 0) END AS cap,
      COALESCE(s.neighbor_reserve, 0) AS reserve
    FROM notification_daily_usage u
    LEFT JOIN emergency_settings s ON s.emergency_id = u.emergency_id
    WHERE (u.emergency_id, u.channel, u.day) IN (${keyValues})
    ORDER BY u.emergency_id, u.channel, u.day
    FOR UPDATE OF u`);

  const usage = new Map(
    rows.map((r) => [
      `${r.emergencyId}|${r.channel}|${r.day}`,
      { userCount: r.userCount, neighborCount: r.neighborCount, cap: r.cap, reserve: r.reserve },
    ]),
  );
  const { denied, usage: next } = allocatePaidMessages(
    usage,
    paid.map((n) => ({ id: n.id, key: usageKey(n), isNeighbor: n.worksiteId !== null })),
  );

  const updates = [...next].map(([key, value]) => {
    const [emergencyId, channel, day] = key.split("|");
    return sql`(${emergencyId}::uuid, ${channel}::notification_channel, ${day}::date, ${value.userCount}::int, ${value.neighborCount}::int)`;
  });
  await tx.execute(sql`
    UPDATE notification_daily_usage u
    SET user_count = v.user_count, neighbor_count = v.neighbor_count
    FROM (VALUES ${sql.join(updates, sql`, `)}) AS v(emergency_id, channel, day, user_count, neighbor_count)
    WHERE u.emergency_id = v.emergency_id AND u.channel = v.channel AND u.day = v.day`);

  const deniedIds = new Set(denied);
  if (denied.length > 0) {
    await tx.execute(sql`
      UPDATE notifications
      SET claimed_at = NULL, failed_at = ${now.toISOString()}, failure_code = 'daily_cap_reached'
      WHERE id IN ${denied}`);
    // SMS has its own cap: a WhatsApp past its cap may still go by SMS.
    await fallBackToSms(
      tx,
      paid
        .filter((n) => deniedIds.has(n.id))
        .map((n) => ({ id: n.id, channel: n.channel, code: "daily_cap_reached" })),
      now,
    );
  }
  return claimed.filter((n) => !deniedIds.has(n.id));
}

/**
 * Locks the usage rows these paid notices reserved, in key order. The outcome transaction takes
 * them after its notification writes, the order a claim uses (notification rows, then usage).
 */
export async function lockPaidUsage(tx: Transaction, notices: ClaimedNotification[]) {
  const keys = [...new Map(notices.filter(isPaid).map((n) => [usageKey(n), n])).entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, n]) => sql`(${n.emergencyId}::uuid, ${n.channel}::notification_channel, ${n.localDay}::date)`);
  if (keys.length === 0) return;
  await tx.execute(sql`
    SELECT 1 FROM notification_daily_usage
    WHERE (emergency_id, channel, day) IN (${sql.join(keys, sql`, `)})
    ORDER BY emergency_id, channel, day
    FOR UPDATE`);
}

/** Gives back the slots of paid rows that were reserved but not sent. Lock them first with lockPaidUsage. */
export async function refundPaidMessages(db: Executor, unsent: ClaimedNotification[]) {
  const counts = new Map<string, { user: number; neighbor: number; row: ClaimedNotification }>();
  for (const n of unsent.filter(isPaid)) {
    const entry = counts.get(usageKey(n)) ?? { user: 0, neighbor: 0, row: n };
    if (n.worksiteId !== null) entry.neighbor += 1;
    else entry.user += 1;
    counts.set(usageKey(n), entry);
  }
  if (counts.size === 0) return;
  const values = [...counts.values()].map(
    ({ row, user, neighbor }) =>
      sql`(${row.emergencyId}::uuid, ${row.channel}::notification_channel, ${row.localDay}::date, ${user}::int, ${neighbor}::int)`,
  );
  await db.execute(sql`
    UPDATE notification_daily_usage u
    SET user_count = u.user_count - v.users, neighbor_count = u.neighbor_count - v.neighbors
    FROM (VALUES ${sql.join(values, sql`, `)}) AS v(emergency_id, channel, day, users, neighbors)
    WHERE u.emergency_id = v.emergency_id AND u.channel = v.channel AND u.day = v.day`);
}
