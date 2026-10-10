import "server-only";

import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getCurrentUser } from "@/shared/auth";

/**
 * Who may use the admin: platform admins only (ADR 0009). Being one never grants access to
 * neighbors' contacts; that still takes coordinator membership in the emergency.
 */
export async function findPlatformAdminId(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.isPlatformAdmin ? user.id : null;
}

/**
 * For admin pages: anyone else gets the 404 page instead of the view and its data. The layout's
 * static shell (the admin nav) is not secret; the data and the actions are what the policy guards.
 */
export async function requirePlatformAdmin(): Promise<string> {
  // The answer depends on the request, so the page is never prerendered at build time.
  await connection();
  const adminId = await findPlatformAdminId();
  if (!adminId) notFound();
  return adminId;
}
