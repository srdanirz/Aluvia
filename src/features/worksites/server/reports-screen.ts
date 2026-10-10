import "server-only";

import { canViewContacts, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { findEmergencyBySlug } from "@/features/emergencies/server";

import { listReportedWorksites, type ReportedWorksitesPage } from "./reported-worksites";

/**
 * The reports screen's data: the emergency's time zone and one page of its reported homes. A
 * coordinator of the emergency or a platform admin also gets the full address, logged as a view;
 * everyone else, signed in or not, gets the street without number. Null for an unknown slug.
 */
export async function getReportsScreen({
  slug,
  locale,
  cursor,
  now,
}: {
  slug: string;
  locale: string;
  cursor: string | null;
  now: Date;
}): Promise<{ timeZone: string; page: ReportedWorksitesPage } | null> {
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return null;
  const access = await getEmergencyAccess(emergency.id);
  const seesContacts = access !== null && (canViewContacts(access) || access.isPlatformAdmin);
  const page = await listReportedWorksites(db, {
    emergencyId: emergency.id,
    locale,
    now,
    cursor,
    contactViewerId: seesContacts ? access.userId : null,
  });
  return { timeZone: emergency.timeZone, page };
}
