import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/shared/env";

import * as schema from "./schema";

const IDLE_TIMEOUT_SECONDS = 20;

// Dev re-evaluates modules on every edit; reusing the pool from globalThis keeps
// connections from piling up. Keep instances x DATABASE_POOL_MAX under the Cloud SQL limit.
const globalForDb = globalThis as unknown as { aluviaSql?: ReturnType<typeof postgres> };
const sql =
  globalForDb.aluviaSql ??
  postgres(env.DATABASE_URL, { max: env.DATABASE_POOL_MAX, idle_timeout: IDLE_TIMEOUT_SECONDS });
if (process.env.NODE_ENV !== "production") globalForDb.aluviaSql = sql;

/** The only database handle. Use it from features/<x>/server/, never from pages or components. */
export const db = drizzle(sql, { schema });
