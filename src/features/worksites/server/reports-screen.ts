import "server-only";

import { canViewContacts, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { findEmergencyBySlug } from "@/features/emergencies/server";
import { findSupplyBalance, type SupplyBalance } from "@/features/supplies/server";

import { listReportedWorksites, type ReportedWorksitesPage } from "./reported-worksites";

/**
 * The reports screen's data, read in parallel: the emergency's time zone, what supplies are missing
 * or spare (issue #14) and one page of its reported homes. A
 * coordinator of the emergency or a platform admin also gets the full address, logged as a view;
 * everyone else, signed in or not, gets the full written address (ADR 0017). Null for an unknown slug.
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
}): Promise<{ timeZone: string; page: ReportedWorksitesPage; supplies: SupplyBalance } | null> {
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return null;
  const access = await getEmergencyAccess(emergency.id);
  const seesContacts = access !== null && (canViewContacts(access) || access.isPlatformAdmin);
  const [page, supplies] = await Promise.all([
    listReportedWorksites(db, {
      emergencyId: emergency.id,
      locale,
      now,
      cursor,
      contactViewerId: seesContacts ? access.userId : null,
    }),
    findSupplyBalance(db, { emergencyId: emergency.id, locale }),
  ]);
  return { timeZone: emergency.timeZone, page, supplies };
}
