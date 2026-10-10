import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/shared/db/schema";

/**
 * Database handle for one-off commands run with tsx, outside Next. Reads .env.local like
 * drizzle.config.ts; CI and Cloud Run set DATABASE_URL directly. Close it with `close()`.
 */
export function connect() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local file: rely on the environment.
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  return { db: drizzle(sql, { schema }), close: () => sql.end() };
}
