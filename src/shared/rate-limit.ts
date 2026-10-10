import "server-only";

import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";
import { rateLimits } from "@/shared/db/schema";

/**
 * Counts a hit against `key` and says whether it is still within `limit` per `windowSeconds`.
 * One atomic statement, so concurrent requests on any instance share the count (SECURITY.md);
 * a window that expired restarts at 1 in the same statement.
 */
export async function hitRateLimit(
  db: Executor,
  { key, limit, windowSeconds }: { key: string; limit: number; windowSeconds: number },
): Promise<boolean> {
  const expired = sql`${rateLimits.windowStartedAt} <= now() - make_interval(secs => ${windowSeconds})`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStartedAt: sql`now()`, hits: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`CASE WHEN ${expired} THEN 1 ELSE ${rateLimits.hits} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${expired} THEN now() ELSE ${rateLimits.windowStartedAt} END`,
      },
    })
    .returning({ hits: rateLimits.hits });
  return (row?.hits ?? Number.POSITIVE_INFINITY) <= limit;
}

// Longer than any window in use (a day), so a purge never resets a live counter.
const STALE_AFTER_SECONDS = 2 * 24 * 60 * 60;
// Small batches keep each purge short; callers run it often enough to keep up.
const PURGE_BATCH = 500;

/** Deletes counters whose window ended long ago. Bounded, so it is cheap to call on hot paths. */
export async function purgeStaleRateLimits(db: Executor): Promise<void> {
  await db.execute(sql`
    DELETE FROM rate_limits WHERE key IN (
      SELECT key FROM rate_limits
      WHERE window_started_at < now() - make_interval(secs => ${STALE_AFTER_SECONDS})
      LIMIT ${PURGE_BATCH} FOR UPDATE SKIP LOCKED
    )`);
}

/**
 * A stable key for the client behind the load balancer, without storing its IP: an HMAC, so the
 * small IPv4 space cannot be brute-forced back from the table. `trustedProxyHops` is how many
 * proxies append to X-Forwarded-For (Cloud Run alone: 1; behind the external load balancer: 2);
 * entries before them are client-supplied and can be forged.
 */
export function clientIpKey(
  headers: Headers,
  { secret, trustedProxyHops }: { secret: string; trustedProxyHops: number },
): string {
  const hops = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const ip = hops.at(-trustedProxyHops) ?? "unknown";
  return createHmac("sha256", secret).update(ip).digest("base64url");
}
