import "server-only";

import { hitFieldWriteLimit, resolveActorKeys, scheduleRateLimitPurge } from "@/shared/anonymous-actor";
import { getEmergencyAccess, isCoordinator, isMember } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { errorResponse, parseJsonBody } from "@/shared/http";
import { meter } from "@/shared/observability/metrics";

import { worksiteUpdateSchema } from "../schemas";
import { createWorksiteUpdate } from "./create-worksite-update";
import { findUpdateTarget } from "./queries";

const updatesCounter = meter.createCounter("aluvia.worksite_updates", {
  unit: "{update}",
  description: "Field updates of people present and missing supplies, by outcome and actor.",
});

/**
 * POST /api/v1/emergencies/[slug]/worksites/[id]/updates: anyone records who is working at a home
 * and what is missing (issues #15, #18; ADR 0018), no account or assignment needed. Rate-limited per
 * IP and device except for coordinators; refused as stale when the home changed since the sender
 * looked. Idempotent by the body's id, like every write the offline outbox sends.
 */
export async function recordWorksiteUpdate(
  request: Request,
  slug: string,
  worksiteId: string,
): Promise<Response> {
  const body = await parseJsonBody(request, worksiteUpdateSchema);
  if (!body.ok) {
    updatesCounter.add(1, { outcome: "rejected", actor: "unknown" });
    return body.response;
  }

  const target = await findUpdateTarget({ slug, worksiteId });
  if (!target) return errorResponse(404, "worksite_not_found");

  const [access, actor] = await Promise.all([getEmergencyAccess(target.emergencyId), resolveActorKeys()]);
  const actorKind = isCoordinator(access) ? "coordinator" : isMember(access) ? "member" : "anonymous";
  if (actorKind !== "coordinator") {
    scheduleRateLimitPurge(db);
    if (!(await hitFieldWriteLimit(db, actor))) {
      updatesCounter.add(1, { outcome: "rate_limited", actor: actorKind });
      return errorResponse(429, "rate_limited");
    }
  }

  const result = await createWorksiteUpdate(db, {
    emergencyId: target.emergencyId,
    worksiteId,
    // Only a member is named; a signed-in guest counts as anonymous, like everyone else.
    reportedBy: isMember(access) ? (access?.userId ?? null) : null,
    actor,
    update: body.data,
  });
  if (!result.ok) {
    updatesCounter.add(1, { outcome: result.code, actor: actorKind });
    const status = result.code === "worksite_not_found" ? 404 : result.code === "stale_version" ? 409 : 422;
    return errorResponse(status, result.code);
  }
  updatesCounter.add(1, { outcome: result.created ? "created" : "retry", actor: actorKind });
  return Response.json({ id: body.data.id }, { status: result.created ? 201 : 200 });
}
