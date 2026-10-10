// Applies the committed migrations in drizzle/ and grants the app's database role access to
// every table. Runs as the Cloud Run job "aluvia-migrate" before each deploy (ADR 0012), with
// the owner role; the app itself has no DDL rights. Migrations must be additive (STYLEGUIDE),
// so the revision still serving traffic keeps working against the new schema.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const { DATABASE_URL, DATABASE_APP_ROLE } = process.env;
if (!DATABASE_URL || !DATABASE_APP_ROLE) throw new Error("DATABASE_URL and DATABASE_APP_ROLE are required");

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
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
