import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Fixed-window counters for public endpoints, shared by every instance (SECURITY.md). The key
 * carries a hash of the client IP, never the IP itself. One row per key, reset in place when its
 * window expires, so the table stays as large as the set of recent clients.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull(),
});
