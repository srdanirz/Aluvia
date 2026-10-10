import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inject } from "vitest";

import * as schema from "@/shared/db/schema";
import { QueryCounter } from "@/shared/db/query-counter";

/** A database handle for one test file, wired to a query counter. Close it in afterAll. */
export function createTestDb() {
  const sql = postgres(inject("databaseUrl"), { max: 2, onnotice: () => {} });
  const counter = new QueryCounter();
  const db = drizzle(sql, { schema, logger: counter });
  return { db, sql, counter, close: () => sql.end() };
}
