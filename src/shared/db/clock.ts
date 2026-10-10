import { type SQL, sql } from "drizzle-orm";

/**
 * The instant a write acts at: Postgres's `now()` (the transaction's start), so every Cloud Run
 * instance decides expiries on one clock, never its own. Tests pass a fixed `now` instead.
 */
export function dbNow(now?: Date): SQL {
  return now ? sql`${now.toISOString()}::timestamptz` : sql`now()`;
}
