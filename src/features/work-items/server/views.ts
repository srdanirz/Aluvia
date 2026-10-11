import "server-only";

import {
  type EmergencyAccess,
  getCurrentUser,
  getEmergencyAccess,
  isCoordinator,
  isMember,
} from "@/shared/auth";
import { db } from "@/shared/db/client";

import { type EmergencyRef, findEmergencyBySlug } from "@/features/emergencies/server";
import { listCurrentWorksiteUpdates, listSupplyNames } from "@/features/worksite-updates/server";

import { groupMyWorkByHome, listMyWorkItems, listWorksiteJobs, listWorksitesToHelp } from "./queries";

/**
 * Everything a work screen shows, fetched in one place so the view appears at once (DESIGN.md,
 * Carga). `viewer` decides what the primary button does: sign in, join, or act.
 */
export type Viewer = "anonymous" | "guest" | "member" | "coordinator";

function viewerOf(access: EmergencyAccess | null): Viewer {
  if (!access) return "anonymous";
  if (isCoordinator(access)) return "coordinator";
  return isMember(access) ? "member" : "guest";
}

async function resolveViewer(emergency: EmergencyRef) {
  const user = await getCurrentUser();
  const access = user ? await getEmergencyAccess(emergency.id) : null;
  return { userId: user?.id ?? null, viewer: viewerOf(access) };
}

export async function loadHelpView({
  slug,
  locale,
  origin,
  cursor,
}: {
  slug: string;
  locale: string;
  origin?: { lat: number; lng: number };
  cursor?: string;
}) {
  const emergency = await findEmergencyBySlug(db, slug);
  if (!emergency) return null;
  const [page, { userId, viewer }, supplyNames] = await Promise.all([
    listWorksitesToHelp(db, { emergencyId: emergency.id, locale, origin, cursor }),
    resolveViewer(emergency),
    listSupplyNames(db, { emergencyId: emergency.id, locale }),
  ]);
  const isActing = userId !== null && (viewer === "member" || viewer === "coordinator");
  // The field count (issue #15) of every listed home in one query, whatever the page size.
  const [updates, mine] = await Promise.all([
    listCurrentWorksiteUpdates(
      page.items.map((home) => home.worksiteId),
      db,
    ),
    isActing ? listMyWorkItems(db, { emergencyId: emergency.id, userId, locale }) : [],
  ]);
  const fieldByWorksite = new Map(
    updates.map((update) => [
      update.worksiteId,
      {
        peoplePresent: update.peoplePresent,
        missingSupplies: update.missingSupplyKeys.map((key) => supplyNames[key] ?? key),
      },
    ]),
  );
  return {
    emergency,
    viewer,
    mine: groupMyWorkByHome(mine),
    nextCursor: page.nextCursor,
    homes: page.items.map((home) => ({ ...home, field: fieldByWorksite.get(home.worksiteId) ?? null })),
  };
}

/** A home's jobs for the slot in the home page (features/map's WorksitePanel). */
export async function loadWorksiteJobsView({
  emergencyId,
  worksiteId,
  locale,
}: {
  emergencyId: string;
  worksiteId: string;
  locale: string;
}) {
  const user = await getCurrentUser();
  const access = user ? await getEmergencyAccess(emergencyId) : null;
  const viewer = viewerOf(access);
  // Everyone gets the jobs: anyone may update their status (ADR 0018); taking one still needs to join.
  const jobs = await listWorksiteJobs(db, { emergencyId, worksiteId, userId: user?.id ?? null, locale });
  return { viewer, jobs };
}
