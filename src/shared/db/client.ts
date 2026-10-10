import "server-only";

import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/shared/env";
import { countRequestQuery } from "@/shared/observability/metrics";

import { createIamTokenSource } from "./iam-token";
import { observeDatabaseConnections } from "./metrics";
import * as schema from "./schema";

const IDLE_TIMEOUT_SECONDS = 20;
// The metrics probe connects once per scrape and closes in between.
const PROBE_IDLE_TIMEOUT_SECONDS = 5;

// Dev re-evaluates modules on every edit; reusing the pool from globalThis keeps
// connections from piling up. Keep instances x (DATABASE_POOL_MAX + 1 probe) under the Cloud
// SQL limit.
const globalForDb = globalThis as unknown as { aluviaSql?: ReturnType<typeof postgres> };
const sql = globalForDb.aluviaSql ?? connect();
if (process.env.NODE_ENV !== "production") globalForDb.aluviaSql = sql;

/** The only database handle. Use it from features/<x>/server/, never from pages or components. */
export const db = drizzle(sql, { schema, logger: { logQuery: countRequestQuery } });

function connect() {
  // Unique per instance, so pg_stat_activity tells this pool's connections apart.
  const poolName = `aluvia-${randomUUID().slice(0, 8)}`;
  // One token source for both clients, so they share a single cached IAM token (ADR 0012).
  const auth = env.DATABASE_IAM_AUTH ? { password: createIamTokenSource() } : {};
  const pool = postgres(env.DATABASE_URL, {
    ...auth,
    max: env.DATABASE_POOL_MAX,
    idle_timeout: IDLE_TIMEOUT_SECONDS,
    connection: { application_name: poolName },
  });
  const probe = postgres(env.DATABASE_URL, {
    ...auth,
    max: 1,
    idle_timeout: PROBE_IDLE_TIMEOUT_SECONDS,
    connection: { application_name: "aluvia-metrics" },
  });
  observeDatabaseConnections(probe, { name: poolName, size: env.DATABASE_POOL_MAX });
  return pool;
}
