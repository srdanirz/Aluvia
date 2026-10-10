import type { Sql } from "postgres";

import { meter } from "@/shared/observability/metrics";

// Managed Prometheus scrapes with a 10 s timeout by default.
const SCRAPE_QUERY_TIMEOUT_MS = 5_000;

/**
 * Publishes the database connections for the Cloud SQL 80 % alert and this instance's pool
 * saturation (ADR 0008). It reads pg_stat_activity through `probe`, a connection of its own:
 * read through the app pool, the sample would wait in line exactly when the pool is full.
 *
 * - `aluvia.db.connections.used` / `.max`: server-wide, the same on every instance; read them
 *   with max() in PromQL, never sum().
 * - `aluvia.db.pool.busy` / `.size`: this instance's pool (its application_name), so busy/size
 *   near 1 means requests are queueing for a connection.
 */
export function observeDatabaseConnections(probe: Sql, pool: { name: string; size: number }): void {
  const used = meter.createObservableGauge("aluvia.db.connections.used", {
    unit: "{connection}",
    description: "Client connections open on the database server",
  });
  const limit = meter.createObservableGauge("aluvia.db.connections.max", {
    unit: "{connection}",
    description: "max_connections on the database server",
  });
  const busy = meter.createObservableGauge("aluvia.db.pool.busy", {
    unit: "{connection}",
    description: "Connections of this instance's pool running a query",
  });
  const size = meter.createObservableGauge("aluvia.db.pool.size", {
    unit: "{connection}",
    description: "Maximum connections of this instance's pool",
  });
  meter.addBatchObservableCallback(
    async (result) => {
      result.observe(size, pool.size);
      const query = probe<{ used: number; max: number; busy: number }[]>`
        select
          count(*) filter (where backend_type = 'client backend')::int as used,
          current_setting('max_connections')::int as max,
          count(*) filter (where application_name = ${pool.name} and state <> 'idle')::int as busy
        from pg_stat_activity`;
      // A missing sample is honest; a stuck scrape would hide every other metric.
      const timer = setTimeout(() => query.cancel(), SCRAPE_QUERY_TIMEOUT_MS);
      try {
        const [row] = await query;
        if (!row) return;
        result.observe(used, row.used);
        result.observe(limit, row.max);
        result.observe(busy, row.busy);
      } finally {
        clearTimeout(timer);
      }
    },
    [used, limit, busy, size],
  );
}
