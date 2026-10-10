import "server-only";

import { cookies } from "next/headers";

const COOKIE_NAME = "aluvia_session";
// Browsers cap cookie lifetime at 400 days. The database decides whether the session is alive
// (session.ts), so the cookie just has to outlive it.
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export async function readSessionToken(): Promise<string | null> {
  return (await cookies()).get(COOKIE_NAME)?.value ?? null;
}

/** Server Actions and route handlers only: a Server Component cannot set cookies. */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not strict: a WhatsApp link opened in the browser must arrive signed in.
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
