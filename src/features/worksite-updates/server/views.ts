import "server-only";

import { getEmergencyAccess, isCoordinator } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { listWorksiteUpdateHistory, type WorksiteUpdateEntry } from "./history";
import { type CurrentWorksiteUpdate, listCurrentWorksiteUpdates, listSupplyNames } from "./queries";

/**
 * What a home's page shows of its field updates: the current state for everyone ("Actualizado hace
 * X") and, for its coordinators, the recent history they can hide entries from. Fetched together.
 */
export async function loadWorksiteFieldView({
  emergencyId,
  worksiteId,
  locale,
}: {
  emergencyId: string;
  worksiteId: string;
  locale: string;
}): Promise<{
  current: CurrentWorksiteUpdate | null;
  supplyNames: Record<string, string>;
  history: WorksiteUpdateEntry[] | null;
}> {
  const [[current], supplyNames, access] = await Promise.all([
    listCurrentWorksiteUpdates([worksiteId]),
    listSupplyNames(db, { emergencyId, locale }),
    getEmergencyAccess(emergencyId),
  ]);
  const history = isCoordinator(access)
    ? await listWorksiteUpdateHistory(db, { emergencyId, worksiteId })
    : null;
  return { current: current ?? null, supplyNames, history };
}
