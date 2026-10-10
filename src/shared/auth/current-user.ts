import "server-only";

import { cache } from "react";

import { db } from "@/shared/db/client";

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

/** The signed-in user's access to an emergency, or null without a session. Once per request. */
export const getEmergencyAccess = cache(async (emergencyId: string): Promise<EmergencyAccess | null> => {
  const user = await getCurrentUser();
  return user ? findEmergencyAccess(db, user.id, emergencyId) : null;
});
