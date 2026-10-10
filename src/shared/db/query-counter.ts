import type { Logger } from "drizzle-orm/logger";

/**
 * Drizzle logger that counts queries. Tests use it to assert a list query issues the same
 * number of queries for 1 row and for 20 (STYLEGUIDE, N+1). It never logs SQL or params.
 */
export class QueryCounter implements Logger {
  count = 0;

  logQuery(): void {
    this.count += 1;
  }

  reset(): void {
    this.count = 0;
  }
}
