import "server-only";

import { getLocale } from "next-intl/server";
import { cache } from "react";

import { db } from "@/shared/db/client";
import { redirect } from "@/shared/i18n/navigation";

import { type EmergencyAccess, findEmergencyAccess } from "./access";
import { findSessionUser, type SessionUser } from "./session";
import { readSessionToken } from "./session-cookie";

/**
 * The signed-in user, or null. Read once per request. It reads the session cookie, so a page that
 * calls it renders at request time under its loading.tsx, never in the static shell.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();
  return token ? findSessionUser(db, token) : null;
});

/**
 * The signed-in user with a name, or a redirect to the login, which asks for the name the first
 * time (DESIGN.md: name and phone, once). `nextPath` is where the login returns, without locale.
 */
export async function requireUser(nextPath: string): Promise<SessionUser & { name: string }> {
  const user = await getCurrentUser();
  if (user?.name) return { ...user, name: user.name };
  const locale = await getLocale();
  return redirect({ href: { pathname: "/login", query: { next: nextPath } }, locale });
}

/** The signed-in user's access to an emergency, or null without a session. Once per request. */
export const getEmergencyAccess = cache(async (emergencyId: string): Promise<EmergencyAccess | null> => {
  const user = await getCurrentUser();
  return user ? findEmergencyAccess(db, user.id, emergencyId) : null;
});
