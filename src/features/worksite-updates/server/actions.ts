"use server";

import { refresh } from "next/cache";

import { trackServerEvent } from "@/shared/analytics/server";
import { getCurrentUser, getEmergencyAccess, isCoordinator } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { cancelWorksiteUpdateSchema } from "../schemas";
import { cancelWorksiteUpdate, type CancelWorksiteUpdateResult } from "./history";

type CancelFailure = Extract<CancelWorksiteUpdateResult, { ok: false }>["code"];

/** A coordinator hides an abusive or wrong update (ADR 0018). The statement re-checks the role. */
export async function cancelWorksiteUpdateAction(
  input: unknown,
): Promise<{ ok: true } | { ok: false; code: CancelFailure | "invalid_input" | "unauthenticated" }> {
  const parsed = cancelWorksiteUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthenticated" };
  const { emergencyId, updateId } = parsed.data;
  if (!isCoordinator(await getEmergencyAccess(emergencyId))) return { ok: false, code: "forbidden" };

  const result = await cancelWorksiteUpdate(db, { emergencyId, updateId, userId: user.id });
  if (!result.ok) return result;
  trackServerEvent("worksite_update_cancelled", { emergencyId }, { distinctId: user.id });
  refresh();
  return { ok: true };
}
