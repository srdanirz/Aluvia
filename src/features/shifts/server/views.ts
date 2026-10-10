import "server-only";

import { findEmergencyBySlug } from "@/features/emergencies/server";
import { getCurrentUser, getEmergencyAccess, isMember } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { listUpcomingShifts } from "./queries";

export type ShiftViewer = "anonymous" | "guest" | "member";

/** The shifts screen's data in one place: the emergency, the page of shifts and who is looking. */
export async function loadShiftsView({
  slug,
  locale,
  cursor,
}: {
  slug: string;
  locale: string;
  cursor?: string;
}) {
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return null;
  const user = await getCurrentUser();
  const [page, access] = await Promise.all([
    listUpcomingShifts(db, {
      emergencyId: emergency.id,
      userId: user?.id ?? null,
      locale,
      cursor,
    }),
    user ? getEmergencyAccess(emergency.id) : null,
  ]);
  const viewer: ShiftViewer = !access ? "anonymous" : isMember(access) ? "member" : "guest";
  return { emergency, page, viewer };
}
