// Keyset pagination shared by every list (STYLEGUIDE, Performance: no unbounded query).

export type Page<T> = { items: T[]; nextCursor: string | null };

/** Max rows a list returns per page (STYLEGUIDE: 100 at most). */
export const PAGE_SIZE = 50;

/** Trims the one extra row a query fetched (`limit PAGE_SIZE + 1`) and turns it into the next cursor. */
export function pageOf<T>(rows: T[], cursorOf: (last: T) => string, size = PAGE_SIZE): Page<T> {
  const items = rows.slice(0, size);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > size && last ? cursorOf(last) : null };
}

/**
 * Opaque cursor for lists ordered by (created_at, id). `at` is the timestamp as Postgres prints
 * it (`created_at::text`), never a JS Date: a Date keeps milliseconds, Postgres microseconds, and
 * the truncated cursor sorts before its own row, so the next page repeats it.
 */
export function encodeTimeCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify([at, id])).toString("base64url");
}

/** The (created_at, id) pair of a cursor, or null for a tampered or stale one (it reads as the first page). */
export function decodeTimeCursor(cursor: string | undefined): [string, string] | null {
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "string")) {
      const [createdAt, id] = value as [string, string];
      if (!Number.isNaN(Date.parse(createdAt)) && /^[0-9a-f-]{36}$/.test(id)) return [createdAt, id];
    }
  } catch {
    // Not base64 JSON: treated as no cursor, same as a stale one.
  }
  return null;
}
