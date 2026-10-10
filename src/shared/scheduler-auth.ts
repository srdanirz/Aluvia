import { timingSafeEqual } from "node:crypto";

import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

/**
 * Who may call the minute-by-minute job endpoints (notifications dispatch, work-item sweeps).
 * In production only Cloud Scheduler: an OIDC token Google signed for our scheduler's service
 * account, with the endpoint's URL as audience. There is no shared secret to leak or rotate.
 * Outside production a static bearer (SCHEDULER_DEV_TOKEN) lets a developer call the job by hand.
 */

const GOOGLE_KEYS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

// .env files leave unset variables as "", which means unset here, not an invalid value.
const unset = (value: unknown) => (value === "" ? undefined : value);
const schema = z.object({
  SCHEDULER_SERVICE_ACCOUNT: z.preprocess(unset, z.email().optional()),
  SCHEDULER_DEV_TOKEN: z.preprocess(unset, z.string().min(32).optional()),
});

// Parsed at import, so a malformed value fails when the server starts, not on every scheduler call.
const startupEnv = schema.parse(process.env);

/** True when the request carries a valid Cloud Scheduler OIDC token for `audience`. */
export async function isSchedulerRequest(
  request: Request,
  audience: string,
  options: { env?: Record<string, string | undefined>; keys?: JWTVerifyGetKey } = {},
): Promise<boolean> {
  const env = options.env ? schema.parse(options.env) : startupEnv;
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return false;

  const isProduction = (options.env ?? process.env).NODE_ENV === "production";
  if (!isProduction && env.SCHEDULER_DEV_TOKEN && sameText(token, env.SCHEDULER_DEV_TOKEN)) return true;
  if (!env.SCHEDULER_SERVICE_ACCOUNT) return false;

  try {
    const { payload } = await jwtVerify(token, options.keys ?? GOOGLE_KEYS, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    return payload.email === env.SCHEDULER_SERVICE_ACCOUNT && payload.email_verified === true;
  } catch {
    // A bad, expired or foreign token is simply not the scheduler; the caller answers 401.
    return false;
  }
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
