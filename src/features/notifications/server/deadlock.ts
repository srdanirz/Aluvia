// Postgres aborts one side of a deadlock with this SQLSTATE; drizzle wraps the driver error in `cause`.
const DEADLOCK_DETECTED = "40P01";

function isDeadlock(error: unknown): boolean {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return code === DEADLOCK_DETECTED || cause?.code === DEADLOCK_DETECTED;
}

/**
 * Runs a transaction again once if Postgres picked it as a deadlock victim. Lock order makes a
 * deadlock unlikely, not impossible; a second one propagates and the next scheduler call retries.
 */
export async function retryOnDeadlock<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isDeadlock(error)) throw error;
    return run();
  }
}
