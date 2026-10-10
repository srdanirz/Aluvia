import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

// Same image as docker-compose.yml, so tests run against the PostGIS we deploy.
const IMAGE = "imresamu/postgis:17-3.5";

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer(IMAGE).start();
  const url = container.getConnectionUri();
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
  project.provide("databaseUrl", url);
}

export async function teardown() {
  await container?.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
