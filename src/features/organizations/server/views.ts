import "server-only";

import { notFound } from "next/navigation";

import { findEmergencyBySlug } from "@/features/emergencies/server";
import { requireUser } from "@/shared/auth/require-user";
import { db } from "@/shared/db/client";

import { listOrganizations } from "./queries";

/** The admin's organizations screen. Anyone else gets a 404, so the screen does not reveal itself. */
export async function loadOrganizationsAdminView(slug: string, after?: string) {
  const user = await requireUser(`/admin/emergencies/${slug}/organizations`);
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency || !user.isPlatformAdmin) notFound();
  const organizations = await listOrganizations(db, { emergencyId: emergency.id, after });
  return { emergency, organizations };
}
