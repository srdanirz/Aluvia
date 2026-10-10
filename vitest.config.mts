import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Server queries import "server-only"; tests are server code, so they get its no-op build.
    alias: { "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/setup/database.ts"],
    // The app's db handle is built at import but never used in tests: queries take the test
    // handle, which carries the query counter. Postgres connects lazily, so this URL is never dialed.
    env: { DATABASE_URL: "postgres://unused:unused@localhost:1/unused" },
    // Integration tests share one PostGIS container; files run in series against it.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
