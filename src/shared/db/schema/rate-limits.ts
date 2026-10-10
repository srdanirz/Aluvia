import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for public endpoints, shared by every instance (SECURITY.md). The key
 * carries a hash of the client IP or phone, never the value itself. One row per key, reset in
 * place when its window expires; rows idle past their window are deleted by purgeStaleRateLimits.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull(),
  },
  (t) => [index("rate_limits_window_started_at_idx").on(t.windowStartedAt)],
);
