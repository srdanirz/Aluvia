import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import type * as schema from "./schema";

/** The drizzle handle shape, for code that runs both in the app and in scripts or tests. */
export type Database = PostgresJsDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** A database or an open transaction: functions that take it compose inside the caller's transaction. */
export type Executor = Database | Transaction;
