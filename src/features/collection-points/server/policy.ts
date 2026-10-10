import "server-only";

import { findOpenEmergencyId } from "@/features/worksites/server";
import { getEmergencyAccess, isCoordinator } from "@/shared/auth";

// Collection points are a coordinator's call; a platform admin can always step in.
export async function findEditor(slug: string) {
  const emergencyId = await findOpenEmergencyId(slug);
  if (!emergencyId) return { ok: false as const, code: "not_found" as const };
  const access = await getEmergencyAccess(emergencyId);
  if (!access || !(isCoordinator(access) || access.isPlatformAdmin))
    return { ok: false as const, code: "forbidden" as const };
  return { ok: true as const, emergencyId, actorId: access.userId };
}

/** Whether the signed-in viewer may add, change and remove points here; false when signed out. */
export async function canEditCollectionPoints(slug: string): Promise<boolean> {
  return (await findEditor(slug)).ok;
}
