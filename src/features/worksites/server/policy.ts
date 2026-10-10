import "server-only";

import { type EmergencyAccess, isCoordinator } from "@/shared/auth";

import type { WorksiteSource } from "../schemas";

/**
 * Who may write homes. Reporting needs no account (DESIGN.md, sin fricción): the open emergency
 * and the rate limit are the only gates. Anything that bypasses a resident's own report (batch
 * import, placing or moving a pin, settling a review) is a coordinator's job.
 */

/** A coordinator's report is marked as such; anyone else reports as a neighbor. */
export function reportSourceFor(
  access: EmergencyAccess | null,
): Extract<WorksiteSource, "neighbor" | "coordinator"> {
  return isCoordinator(access) ? "coordinator" : "neighbor";
}

export function canImportWorksites(access: EmergencyAccess | null): boolean {
  return isCoordinator(access);
}

export function canPlaceWorksite(access: EmergencyAccess | null): boolean {
  return isCoordinator(access);
}

export function canReviewWorksite(access: EmergencyAccess | null): boolean {
  return isCoordinator(access);
}
