import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";
import { purgeStaleRateLimits } from "@/shared/rate-limit";

// Small batches keep each purge short; it runs on every code request, which outpaces what expires.
const PURGE_BATCH = 500;

/**
 * Deletes expired login codes and sessions, and stale rate-limit counters, in bounded batches.
 * Without it, every phone or IP that ever asked for a code would leave rows forever. SKIP LOCKED:
 * concurrent purges split the work instead of waiting on (or deadlocking with) each other.
 */
export async function purgeExpiredAuthData(db: Executor): Promise<void> {
  await Promise.all([
    db.execute(sql`
      DELETE FROM login_codes WHERE id IN (
        SELECT id FROM login_codes WHERE expires_at < now() LIMIT ${PURGE_BATCH} FOR UPDATE SKIP LOCKED)`),
    db.execute(sql`
      DELETE FROM sessions WHERE id IN (
        SELECT id FROM sessions WHERE expires_at < now() LIMIT ${PURGE_BATCH} FOR UPDATE SKIP LOCKED)`),
    purgeStaleRateLimits(db),
  ]);
}
