import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { createIamTokenSource } from "@/shared/db/iam-token";
import * as schema from "@/shared/db/schema";

/**
 * Database handle for one-off commands run with tsx, outside Next. Reads .env.local like
 * drizzle.config.ts; CI and Cloud Run set DATABASE_URL directly, and the Cloud Run job
 * aluvia-task adds DATABASE_IAM_AUTH=true (ADR 0012). Close it with `close()`.
 */
export function connect() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // No local file: rely on the environment.
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  const sql = postgres(url, {
    max: 1,
    onnotice: () => {},
    ...(process.env.DATABASE_IAM_AUTH === "true" && { password: createIamTokenSource() }),
  });
  return { db: drizzle(sql, { schema }), close: () => sql.end() };
}
