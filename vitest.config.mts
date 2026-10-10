import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: ["tests/setup/database.ts"],
    // Integration tests share one PostGIS container; files run in series against it.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
