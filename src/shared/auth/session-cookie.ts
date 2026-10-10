import "server-only";

import { cookies } from "next/headers";

const isProduction = process.env.NODE_ENV === "production";
// __Host-: the browser only accepts it over HTTPS, for the whole site and from this host alone,
// so a sibling subdomain cannot set or shadow it. Plain HTTP on localhost cannot carry the prefix.
const COOKIE_NAME = isProduction ? "__Host-aluvia_session" : "aluvia_session";
// Browsers cap cookie lifetime at 400 days. The database decides whether the session is alive
// (session.ts), so the cookie just has to outlive it.
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  // Lax, not strict: a WhatsApp link opened in the browser must arrive signed in.
  sameSite: "lax",
  path: "/",
} as const;

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

/** Server Actions and route handlers only: a Server Component cannot set cookies. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: COOKIE_MAX_AGE_SECONDS });
}

/** Overwrites with the same attributes: a __Host- cookie deleted without Secure is ignored by the browser. */
export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}
