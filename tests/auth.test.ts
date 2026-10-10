import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { requestLoginCode, verifyLoginCode } from "@/features/auth/server/login";
import { hashToken } from "@/shared/auth/crypto";
import { createLoginCodeSender, type LoginCodeMessage } from "@/shared/auth/login-code-sender";
import { normalizePhone } from "@/shared/auth/phone";
import { purgeExpiredAuthData } from "@/shared/auth/purge";
import { createSession, findSessionUser } from "@/shared/auth/session";
import { safePathSchema } from "@/shared/lib/safe-path";
import { hitRateLimit } from "@/shared/rate-limit";

import { createTestDb } from "./setup/db";

const RACERS = 8;
const { db, close } = createTestDb({ connections: RACERS + 2 });
afterAll(close);

// Clearly fictional numbers (+56 9 00...), never real people (SECURITY.md).
let phoneSeq = 0;
const nextPhone = () => `+56900${String(phoneSeq++).padStart(6, "0")}`;
const ipKey = "test-ip";

/** Requests a code and returns it, captured from the sender instead of a phone. */
async function requestCode(phone: string): Promise<string> {
  let sent: LoginCodeMessage | undefined;
  const result = await requestLoginCode(
    db,
    { phone, ipKey: `${ipKey}-${phone}`, locale: "es" },
    async (message) => {
      sent = message;
      return { ok: true };
    },
  );
  if (!result.ok || !sent) throw new Error(`code not sent: ${JSON.stringify(result)}`);
  return sent.code;
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

beforeEach(async () => {
  await db.execute(sql`DELETE FROM rate_limits`);
});

describe("phone numbers", () => {
  it("normalizes numbers of allowed countries to E.164 and rejects the rest", () => {
    expect(normalizePhone("9 0000 0001")).toBe("+56900000001");
    expect(normalizePhone("+56 9 0000 0001")).toBe("+56900000001");
    expect(normalizePhone("+54 9 11 1234 5678")).toBeNull();
    expect(normalizePhone("9 1234")).toBeNull();
    expect(normalizePhone("hola")).toBeNull();
  });
});

describe("return paths", () => {
  it("keeps in-app paths and drops anything that leaves the site", () => {
    expect(safePathSchema.parse("/emergencies/x/join")).toBe("/emergencies/x/join");
    expect(safePathSchema.parse("//evil.example")).toBe("/");
    expect(safePathSchema.parse("/\\evil.example")).toBe("/");
    expect(safePathSchema.parse("https://evil.example")).toBe("/");
    expect(safePathSchema.parse(undefined)).toBe("/");
  });
});

describe("login codes", () => {
  it("signs in with the code, creating the person once and reusing them after", async () => {
    const phone = nextPhone();
    const first = await verifyLoginCode(db, { phone, code: await requestCode(phone), ipKey });
    expect(first).toMatchObject({ ok: true, hasName: false });
    if (!first.ok) return;
    expect(await findSessionUser(db, first.token)).toEqual({
      id: first.userId,
      name: null,
      isPlatformAdmin: false,
    });

    const second = await verifyLoginCode(db, { phone, code: await requestCode(phone), ipKey });
    expect(second.ok && second.userId).toBe(first.userId);
  });

  it("stores neither the phone nor the code in clear", async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    const rows = await db.execute<{ phone_hash: string; code_hash: string }>(
      sql`SELECT phone_hash, code_hash FROM login_codes ORDER BY created_at DESC LIMIT 1`,
    );
    expect(JSON.stringify(rows)).not.toContain(phone);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("rejects a wrong code, then locks the code after five guesses", async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    // In parallel on purpose: every guess is counted atomically, whatever the order.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => verifyLoginCode(db, { phone, code: wrong(code), ipKey })),
    );
    expect(results.map((r) => !r.ok && r.code)).toEqual(Array(5).fill("invalid_code"));
    expect(await verifyLoginCode(db, { phone, code, ipKey })).toEqual({
      ok: false,
      code: "too_many_attempts",
    });
  });

  it("only accepts the newest, unexpired code", async () => {
    const phone = nextPhone();
    const old = await requestCode(phone);
    const fresh = await requestCode(phone);
    if (old !== fresh) {
      expect(await verifyLoginCode(db, { phone, code: old, ipKey })).toEqual({
        ok: false,
        code: "invalid_code",
      });
    }
    await db.execute(sql`UPDATE login_codes SET expires_at = now() - interval '1 second'`);
    expect(await verifyLoginCode(db, { phone, code: fresh, ipKey })).toEqual({
      ok: false,
      code: "code_expired",
    });
  });

  it("opens exactly one session when the same code is sent many times at once", async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    const results = await Promise.all(
      Array.from({ length: RACERS }, () => verifyLoginCode(db, { phone, code, ipKey })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const ok = results.find((r) => r.ok);
    const [sessions] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM sessions WHERE user_id = ${ok?.ok ? ok.userId : null}`,
    );
    expect(sessions?.n).toBe(1);
  });

  it("caps codes per phone", async () => {
    const phone = nextPhone();
    const send = async () => ({ ok: true }) as const;
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) =>
        requestLoginCode(db, { phone, ipKey: `ip-${i}`, locale: "es" }, send),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.code === "rate_limited")).toHaveLength(2);
  });

  it("caps guesses per phone from one address without locking the phone out elsewhere", async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    const fromOne = await Promise.all(
      Array.from({ length: 21 }, () =>
        verifyLoginCode(db, { phone, code: wrong(code), ipKey: "one-device" }),
      ),
    );
    expect(fromOne.filter((r) => !r.ok && r.code === "rate_limited")).toHaveLength(1);
    const fresh = await requestCode(phone);
    expect(await verifyLoginCode(db, { phone, code: fresh, ipKey: "the-owner" })).toMatchObject({ ok: true });
  });

  it("caps guesses per phone across addresses", async () => {
    const phone = nextPhone();
    const code = await requestCode(phone);
    // 6 addresses x 17 guesses: each address stays under its own cap of 20, the phone does not.
    const guesses = await Promise.all(
      Array.from({ length: 102 }, (_, i) =>
        verifyLoginCode(db, { phone, code: wrong(code), ipKey: `spread-${i % 6}` }),
      ),
    );
    expect(guesses.filter((r) => !r.ok && r.code === "rate_limited")).toHaveLength(2);
  });

  it("purges expired codes, sessions and stale counters", async () => {
    await requestCode(nextPhone());
    await db.execute(sql`UPDATE login_codes SET expires_at = now() - interval '1 minute'`);
    await db.execute(sql`UPDATE rate_limits SET window_started_at = now() - interval '3 days'`);
    await purgeExpiredAuthData(db);
    const [left] = await db.execute<{ codes: number; limits: number }>(sql`
      SELECT (SELECT count(*)::int FROM login_codes) AS codes, (SELECT count(*)::int FROM rate_limits) AS limits`);
    expect(left).toEqual({ codes: 0, limits: 0 });
  });

  it("reports a code the channel could not deliver", async () => {
    const result = await requestLoginCode(db, { phone: nextPhone(), ipKey, locale: "es" }, async () => ({
      ok: false,
      code: "provider_down",
      retryable: true,
    }));
    expect(result).toEqual({ ok: false, code: "code_not_sent" });
  });
});

describe("sessions", () => {
  async function createUser() {
    const [user] = await db.execute<{ id: string }>(
      sql`INSERT INTO users (phone) VALUES (${nextPhone()}) RETURNING id`,
    );
    if (!user) throw new Error("user not created");
    return user.id;
  }

  it("stores only the token's hash", async () => {
    const token = await createSession(db, await createUser());
    const rows = await db.execute(sql`SELECT 1 FROM sessions WHERE id = ${hashToken(token)}`);
    expect(rows).toHaveLength(1);
    expect(await db.execute(sql`SELECT 1 FROM sessions WHERE id = ${token}`)).toHaveLength(0);
  });

  it("forgets an expired session and slides one that is in use", async () => {
    const userId = await createUser();
    const expired = await createSession(db, userId);
    await db.execute(
      sql`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE id = ${hashToken(expired)}`,
    );
    expect(await findSessionUser(db, expired)).toBeNull();

    const aging = await createSession(db, userId);
    await db.execute(
      sql`UPDATE sessions SET expires_at = now() + interval '2 days' WHERE id = ${hashToken(aging)}`,
    );
    expect(await findSessionUser(db, aging)).toMatchObject({ id: userId });
    const [row] = await db.execute<{ days: number }>(
      sql`SELECT extract(day FROM expires_at - now())::int AS days FROM sessions WHERE id = ${hashToken(aging)}`,
    );
    expect(row?.days).toBeGreaterThanOrEqual(29);
  });
});

describe("rate limits", () => {
  it("lets exactly `limit` hits through when they arrive together", async () => {
    const results = await Promise.all(
      Array.from({ length: RACERS }, () => hitRateLimit(db, { key: "race", limit: 3, windowSeconds: 60 })),
    );
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("starts a new window once the old one has passed", async () => {
    await hitRateLimit(db, { key: "window", limit: 1, windowSeconds: 60 });
    expect(await hitRateLimit(db, { key: "window", limit: 1, windowSeconds: 60 })).toBe(false);
    await db.execute(
      sql`UPDATE rate_limits SET window_started_at = now() - interval '61 seconds' WHERE key = 'window'`,
    );
    expect(await hitRateLimit(db, { key: "window", limit: 1, windowSeconds: 60 })).toBe(true);
  });
});

describe("code delivery", () => {
  const message = { phone: "+56900000009", code: "123456", locale: "es" };
  const ok = async () => ({ ok: true }) as const;
  const fail = (code: string) => async () => ({ ok: false, code, retryable: false }) as const;

  it("sends by WhatsApp and does not touch SMS when it works", async () => {
    let smsCalls = 0;
    const send = createLoginCodeSender({ whatsapp: ok, sms: async () => (smsCalls++, { ok: true }) });
    expect(await send(message)).toEqual({ ok: true });
    expect(smsCalls).toBe(0);
  });

  it("falls back to SMS when WhatsApp fails", async () => {
    const send = createLoginCodeSender({ whatsapp: fail("provider_auth"), sms: ok });
    expect(await send(message)).toEqual({ ok: true });
  });

  it("tells a number without WhatsApp apart when there is no SMS", async () => {
    const send = createLoginCodeSender({ whatsapp: fail("invalid_address"), sms: null });
    const result = await requestLoginCode(db, { phone: nextPhone(), ipKey: "delivery", locale: "es" }, send);
    expect(result).toEqual({ ok: false, code: "no_whatsapp" });
  });

  it("reports any other failure as a code not sent", async () => {
    const send = createLoginCodeSender({
      whatsapp: fail("template_missing"),
      sms: fail("provider_unavailable"),
    });
    const result = await requestLoginCode(
      db,
      { phone: nextPhone(), ipKey: "delivery-2", locale: "es" },
      send,
    );
    expect(result).toEqual({ ok: false, code: "code_not_sent" });
  });
});
