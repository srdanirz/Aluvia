import "server-only";

import { sql } from "drizzle-orm";

import { createLoginCode, hashesMatch, hashSecret } from "@/shared/auth/crypto";
import { type LoginCodeSender, sendLoginCode } from "@/shared/auth/login-code-sender";
import { purgeExpiredAuthData } from "@/shared/auth/purge";
import { createSession } from "@/shared/auth/session";
import type { Executor } from "@/shared/db/types";
import { hitRateLimit } from "@/shared/rate-limit";

// A code lives long enough to switch to WhatsApp and back on a weak signal.
const CODE_MINUTES = 10;
// 5 guesses at a 6-digit code: 1 in 200,000 per code, and codes per phone are capped below.
const MAX_ATTEMPTS = 5;
const HOUR = 60 * 60;
// Each code costs a WhatsApp or SMS message. Per phone: enough to retry a few times. Per IP:
// generous, because Chilean mobile carriers put many people behind one address (CGNAT).
const CODES_PER_PHONE_PER_HOUR = 5;
const CODES_PER_IP_PER_HOUR = 30;
const VERIFICATIONS_PER_IP_PER_HOUR = 60;
// Caps guessing across codes and IPs at 20 tries a day per phone (1 in 50,000 a day of hitting
// one account), and how long someone else can keep a phone locked out by burning its codes.
const VERIFICATIONS_PER_PHONE_PER_DAY = 20;
const DAY = 24 * HOUR;

export type RequestLoginCodeResult = { ok: true } | { ok: false; code: "rate_limited" | "code_not_sent" };

/** Sends a fresh code to `phone` (E.164). The previous codes of that phone stop counting. */
export async function requestLoginCode(
  db: Executor,
  { phone, ipKey, locale }: { phone: string; ipKey: string; locale: string },
  send: LoginCodeSender = sendLoginCode,
): Promise<RequestLoginCodeResult> {
  const phoneHash = hashSecret(phone);
  const [phoneAllowed, ipAllowed] = await Promise.all([
    hitRateLimit(db, {
      key: `login_code:phone:${phoneHash}`,
      limit: CODES_PER_PHONE_PER_HOUR,
      windowSeconds: HOUR,
    }),
    hitRateLimit(db, { key: `login_code:ip:${ipKey}`, limit: CODES_PER_IP_PER_HOUR, windowSeconds: HOUR }),
  ]);
  if (!phoneAllowed || !ipAllowed) return { ok: false, code: "rate_limited" };

  const code = createLoginCode();
  await db.execute(sql`
    INSERT INTO login_codes (phone_hash, code_hash, expires_at)
    VALUES (${phoneHash}, ${hashSecret(code)}, now() + make_interval(mins => ${CODE_MINUTES}))`);

  // After the insert is committed, never inside a transaction (STYLEGUIDE, Robustez).
  const [sent] = await Promise.all([
    send({ phone, code, locale }),
    // Housekeeping must never turn a delivered code into an error for the person.
    purgeExpiredAuthData(db).catch((error: unknown) => {
      // TODO(#23): logError("auth_purge_failed", error) once the logger is on main.
      process.stderr.write(`${JSON.stringify({ event: "auth_purge_failed", message: String(error) })}\n`);
    }),
  ]);
  return sent.ok ? { ok: true } : { ok: false, code: "code_not_sent" };
}

export type VerifyLoginCodeResult =
  | { ok: true; userId: string; token: string; hasName: boolean }
  | { ok: false; code: "rate_limited" | "invalid_code" | "code_expired" | "too_many_attempts" };

/**
 * Checks the newest code of `phone` and, if it matches, signs in (creating the person on their
 * first login) and returns the session token for the cookie. Every guess counts against the code
 * before it is compared, and consuming it is a conditional UPDATE: one code opens one session.
 */
export async function verifyLoginCode(
  db: Executor,
  { phone, code, ipKey }: { phone: string; code: string; ipKey: string },
): Promise<VerifyLoginCodeResult> {
  const phoneHash = hashSecret(phone);
  const [ipAllowed, phoneAllowed] = await Promise.all([
    hitRateLimit(db, {
      key: `login_verify:ip:${ipKey}`,
      limit: VERIFICATIONS_PER_IP_PER_HOUR,
      windowSeconds: HOUR,
    }),
    hitRateLimit(db, {
      key: `login_verify:phone:${phoneHash}`,
      limit: VERIFICATIONS_PER_PHONE_PER_DAY,
      windowSeconds: DAY,
    }),
  ]);
  if (!ipAllowed || !phoneAllowed) return { ok: false, code: "rate_limited" };

  const [attempt] = await db.execute<{ id: string; code_hash: string; attempts: number }>(sql`
    UPDATE login_codes SET attempts = attempts + 1
    WHERE id = (
      SELECT id FROM login_codes
      WHERE phone_hash = ${phoneHash} AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1
    )
    RETURNING id, code_hash, attempts`);
  if (!attempt) return { ok: false, code: "code_expired" };
  if (attempt.attempts > MAX_ATTEMPTS) return { ok: false, code: "too_many_attempts" };
  if (!hashesMatch(attempt.code_hash, hashSecret(code))) return { ok: false, code: "invalid_code" };

  return db.transaction(async (tx) => {
    const consumed = await tx.execute(sql`
      UPDATE login_codes SET consumed_at = now()
      WHERE id = ${attempt.id} AND consumed_at IS NULL RETURNING id`);
    if (consumed.length === 0) return { ok: false, code: "code_expired" } as const;

    // DO UPDATE, not DO NOTHING, so RETURNING also yields the row of a returning user.
    const [user] = await tx.execute<{ id: string; name: string | null }>(sql`
      INSERT INTO users (phone) VALUES (${phone})
      ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
      RETURNING id, name`);
    if (!user) throw new Error("user upsert returned no row");

    const token = await createSession(tx, user.id);
    return { ok: true, userId: user.id, token, hasName: Boolean(user.name) } as const;
  });
}

/** Sets the name asked once after the first login. */
export async function updateUserName(db: Executor, { userId, name }: { userId: string; name: string }) {
  await db.execute(sql`UPDATE users SET name = ${name} WHERE id = ${userId}`);
}
