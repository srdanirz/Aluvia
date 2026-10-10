/** SQLSTATE codes the app maps to typed results instead of a 500. */
export const UNIQUE_VIOLATION = "23505";
export const FOREIGN_KEY_VIOLATION = "23503";
export const CHECK_VIOLATION = "23514";
// Postgres aborted this transaction to break a lock cycle; running it again is safe.
export const DEADLOCK_DETECTED = "40P01";

/**
 * The Postgres error behind a failed write, if that is what it was. Drizzle wraps the driver's
 * error in `cause`; anything else (a bug, a lost connection) returns undefined and should rethrow.
 */
export function postgresErrorOf(error: unknown): { code: string; constraint?: string } | undefined {
  const cause = (error as { cause?: { code?: unknown; constraint_name?: unknown } } | null)?.cause;
  if (typeof cause?.code !== "string") return undefined;
  return {
    code: cause.code,
    constraint: typeof cause.constraint_name === "string" ? cause.constraint_name : undefined,
  };
}
