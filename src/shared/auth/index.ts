import "server-only";

import type { Executor } from "@/shared/db/types";

// TODO(#16): stub of the @/shared/auth contract agreed with feat/auth, same names and
// signatures. It grants nothing, so every coordinator and field-volunteer path stays closed
// until the real module replaces this file.

export type MemberRole = "volunteer" | "field_volunteer" | "coordinator";

export type EmergencyAccess = {
  userId: string;
  emergencyId: string;
  isPlatformAdmin: boolean;
  role: MemberRole | null;
};

/** The signed-in person's access to an emergency; null without a session. */
export async function getEmergencyAccess(emergencyId: string): Promise<EmergencyAccess | null> {
  void emergencyId;
  return null;
}

/** An approved coordinator of the emergency. Being a platform admin does not count (ADR 0009). */
export function isCoordinator(access: EmergencyAccess | null): boolean {
  return access?.role === "coordinator";
}

/** Coordinators always; field volunteers only on the homes assigned to them. */
export async function canUpdateWorksite(
  db: Executor,
  access: EmergencyAccess | null,
  worksiteId: string,
): Promise<boolean> {
  void db;
  void worksiteId;
  return isCoordinator(access);
}
