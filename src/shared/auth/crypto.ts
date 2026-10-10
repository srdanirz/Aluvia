import "server-only";

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { env } from "@/shared/env";

const LOGIN_CODE_DIGITS = 6;
// 160 bits: unguessable, and short enough for a cookie or a link sent by WhatsApp.
const TOKEN_BYTES = 20;

/** Keyed hash for low-entropy values (a 6-digit code, a phone): without AUTH_SECRET it cannot be brute-forced offline. */
export function hashSecret(value: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("base64url");
}

/** Plain hash for high-entropy tokens; the token itself is the secret. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function createToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function createLoginCode(): string {
  return randomInt(0, 10 ** LOGIN_CODE_DIGITS)
    .toString()
    .padStart(LOGIN_CODE_DIGITS, "0");
}

/** Constant-time comparison of two hashes, so the time taken says nothing about how much matched. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
