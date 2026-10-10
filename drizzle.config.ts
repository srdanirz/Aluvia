import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read Next's env files; CI and Cloud Run set DATABASE_URL directly.
try {
  process.loadEnvFile(".env.local");
} catch {
  // No local file: rely on the environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/shared/db/schema",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
