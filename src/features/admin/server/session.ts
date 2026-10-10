import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/shared/db/client";
import { users } from "@/shared/db/schema";
import { env } from "@/shared/env";

export type CurrentUser = { id: string; name: string | null; isPlatformAdmin: boolean };

/**
 * TODO(#16): stand-in for `getCurrentUser` from "@/shared/auth" (feat/auth), same shape. Delete
 * this file when it merges. Until then nobody is signed in, except in development, where
 * DEV_ADMIN_USER_ID lets the maintainers browse the admin as that user.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // env.ts refuses DEV_ADMIN_USER_ID in production.
  const userId = env.DEV_ADMIN_USER_ID;
  if (!userId) return null;
  const user = await db.query.users.findFirst({
    columns: { id: true, name: true, platformRole: true },
    where: eq(users.id, userId),
  });
  return user ? { id: user.id, name: user.name, isPlatformAdmin: user.platformRole === "admin" } : null;
}
