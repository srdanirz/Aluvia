import "server-only";

import { sql } from "drizzle-orm";

import { db } from "./client";

/** Round trip to Postgres for the health check. Throws when the database is unreachable. */
export async function pingDatabase(): Promise<void> {
  await db.execute(sql`select 1`);
}
