import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { z } from "zod";

import type { Executor } from "@/shared/db/types";
import { env } from "@/shared/env";
import { clientIpKey, hitRateLimit, purgeStaleRateLimits } from "@/shared/rate-limit";

/**
 * Who sent an open write (ADR 0018) without an account: HMACs of a random device cookie and of the
 * IP, never the values. Enough to rate-limit and to show a coordinator that one source sent many
 * changes; not enough to identify a person. The cookie is forgeable and clearable, so the IP limit
 * is the floor and the device limit only narrows it for well-behaved browsers.
 */
export type ActorKeys = { deviceKey: string; ipKey: string };

const isProduction = process.env.NODE_ENV === "production";
// Same prefix rules as the session cookie (src/shared/auth/session-cookie.ts).
const DEVICE_COOKIE = isProduction ? "__Host-aluvia_device" : "aluvia_device";
const DEVICE_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const deviceIdSchema = z.uuid();

// Generous per IP: Chilean mobile networks put many phones behind one address (CGNAT), and a
// brigade on one wifi updates dozens of homes in an hour (SECURITY.md). Tighter per device: one
// phone rarely needs more than a change every 20 seconds.
const FIELD_WRITES_PER_IP = 120;
const FIELD_WRITES_PER_DEVICE = 30;
const FIELD_WRITE_WINDOW_SECONDS = 600;
// About one write in a hundred also clears old counters, like the public report endpoint.
const PURGE_EVERY = 100;

const keyed = (label: string, value: string) =>
  createHmac("sha256", env.RATE_LIMIT_SECRET).update(`${label}:${value}`).digest("base64url");

/**
 * The actor keys of the current request. Server Actions and route handlers only: a device without
 * the cookie gets one here, which a Server Component could not set.
 */
export async function resolveActorKeys(): Promise<ActorKeys> {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  let deviceId = jar.get(DEVICE_COOKIE)?.value;
  if (!deviceId || !deviceIdSchema.safeParse(deviceId).success) {
    deviceId = randomUUID();
    jar.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
  }
  const ipKey = clientIpKey(requestHeaders, {
    secret: env.RATE_LIMIT_SECRET,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  return { deviceKey: keyed("device", deviceId), ipKey };
}

/**
 * Counts one open field write (a people-and-supplies update or a status change) against the IP and
 * the device; false when either is over its limit. Both counters advance, so a device that keeps
 * trying still spends its network's budget.
 */
export async function hitFieldWriteLimit(db: Executor, actor: ActorKeys): Promise<boolean> {
  const [byIp, byDevice] = await Promise.all([
    hitRateLimit(db, {
      key: `field_write:ip:${actor.ipKey}`,
      limit: FIELD_WRITES_PER_IP,
      windowSeconds: FIELD_WRITE_WINDOW_SECONDS,
    }),
    hitRateLimit(db, {
      key: `field_write:device:${actor.deviceKey}`,
      limit: FIELD_WRITES_PER_DEVICE,
      windowSeconds: FIELD_WRITE_WINDOW_SECONDS,
    }),
  ]);
  return byIp && byDevice;
}

/** Request scope only (uses `after`): now and then, clears old counters once the response is sent. */
export function scheduleRateLimitPurge(db: Executor): void {
  if (Math.random() < 1 / PURGE_EVERY) after(() => purgeStaleRateLimits(db));
}

export const FIELD_WRITE_LIMITS = {
  perIp: FIELD_WRITES_PER_IP,
  perDevice: FIELD_WRITES_PER_DEVICE,
  windowSeconds: FIELD_WRITE_WINDOW_SECONDS,
} as const;
