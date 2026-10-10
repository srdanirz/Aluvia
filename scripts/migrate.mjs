// Applies the committed migrations in drizzle/ and grants the app's database role access to
// every table. Runs as the Cloud Run job "aluvia-migrate" before each deploy (ADR 0012), logged
// in through IAM as the schema owner; the app itself has no DDL rights. Migrations must be additive (STYLEGUIDE),
// so the revision still serving traffic keeps working against the new schema.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const { DATABASE_URL, DATABASE_APP_ROLE, DATABASE_IAM_AUTH } = process.env;
if (!DATABASE_URL || !DATABASE_APP_ROLE) throw new Error("DATABASE_URL and DATABASE_APP_ROLE are required");

// Under IAM authentication the password is the job's access token. One connection that lives
// minutes at most, so a single token is enough (src/shared/db/iam-token.ts caches for the app).
async function fetchAccessToken() {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } },
  );
  if (!response.ok) throw new Error(`metadata token request failed: ${response.status}`);
  const { access_token: token } = await response.json();
  if (typeof token !== "string") throw new Error("metadata token response is malformed");
  return token;
}

const sql = postgres(DATABASE_URL, {
  max: 1,
  onnotice: () => {},
  ...(DATABASE_IAM_AUTH === "true" && { password: fetchAccessToken }),
});
try {
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  // Quoted by hand: sql(identifier) splits on ".", and IAM role names end in ".iam".
  const role = `"${DATABASE_APP_ROLE.replaceAll('"', '""')}"`;
  // Re-granted every run so tables added by this deploy are covered. No DDL, no TRUNCATE.
  await sql.begin((tx) => [
    tx.unsafe(`grant usage on schema public to ${role}`),
    tx.unsafe(`grant select, insert, update, delete on all tables in schema public to ${role}`),
    tx.unsafe(`grant usage, select on all sequences in schema public to ${role}`),
    // PostGIS's reference table is data the app reads, never writes.
    tx.unsafe(`revoke insert, update, delete on spatial_ref_sys from ${role}`),
  ]);
  console.log(JSON.stringify({ severity: "INFO", message: "migrations_applied" }));
} finally {
  await sql.end();
}
