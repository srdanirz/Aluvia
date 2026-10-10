import { DEADLOCK_DETECTED, postgresErrorOf } from "@/shared/db/errors";

/**
 * Runs a transaction again once if Postgres picked it as a deadlock victim. Lock order makes a
 * deadlock unlikely, not impossible; a second one propagates and the next scheduler call retries.
 */
export async function retryOnDeadlock<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (postgresErrorOf(error)?.code !== DEADLOCK_DETECTED) throw error;
    return run();
  }
}
