import "server-only";

import { sql } from "drizzle-orm";

import type { Executor } from "@/shared/db/types";

import { createToken, hashToken } from "./crypto";

// A device stays signed in while it is used at least once a month: a volunteer should not have
// to log in again mid-emergency. Expiry is pushed forward only in the second half of its life,
// so most requests read the session without writing it.
const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 15;

export type SessionUser = { id: string; name: string | null; isPlatformAdmin: boolean };

/** Opens a session and returns the token for the cookie. Only its hash is stored. */
export async function createSession(db: Executor, userId: string): Promise<string> {
  const token = createToken();
  await db.execute(sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}, now() + make_interval(days => ${SESSION_DAYS}))`);
  return token;
}

/** The user behind a live session token, or null. Slides the expiry forward when it is due. */
export async function findSessionUser(db: Executor, token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const rows = await db.execute<{ id: string; name: string | null; platform_role: string | null }>(sql`
    WITH renewed AS (
      UPDATE sessions SET expires_at = now() + make_interval(days => ${SESSION_DAYS})
      WHERE id = ${id} AND expires_at > now()
        AND expires_at < now() + make_interval(days => ${RENEW_WITHIN_DAYS})
    )
    SELECT u.id, u.name, u.platform_role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ${id} AND s.expires_at > now()`);
  const row = rows[0];
  return row ? { id: row.id, name: row.name, isPlatformAdmin: row.platform_role === "admin" } : null;
}

export async function deleteSession(db: Executor, token: string): Promise<void> {
  await db.execute(sql`DELETE FROM sessions WHERE id = ${hashToken(token)}`);
}
