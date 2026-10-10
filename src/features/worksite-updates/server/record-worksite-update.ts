import "server-only";

import { canUpdateWorksite, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { errorResponse, parseJsonBody } from "@/shared/http";
import { meter } from "@/shared/observability/metrics";

import { worksiteUpdateSchema } from "../schemas";
import { createWorksiteUpdate } from "./create-worksite-update";
import { findUpdateTarget } from "./queries";

const updatesCounter = meter.createCounter("aluvia.worksite_updates", {
  unit: "{update}",
  description: "Field updates of people present and missing supplies, by outcome.",
});

/**
 * POST /api/v1/emergencies/[slug]/worksites/[id]/updates: a field volunteer assigned to the home,
 * or a coordinator, records who is working there and what is missing (issues #15, #18).
 * Idempotent by the body's id, like every write the offline outbox sends.
 */
export async function recordWorksiteUpdate(
  request: Request,
  slug: string,
  worksiteId: string,
): Promise<Response> {
  const body = await parseJsonBody(request, worksiteUpdateSchema);
  if (!body.ok) {
    updatesCounter.add(1, { outcome: "rejected" });
    return body.response;
  }

  const target = await findUpdateTarget({ slug, worksiteId });
  if (!target) return errorResponse(404, "worksite_not_found");

  const access = await getEmergencyAccess(target.emergencyId);
  if (!access) return errorResponse(401, "sign_in_required");
  if (!(await canUpdateWorksite(db, access, worksiteId))) {
    updatesCounter.add(1, { outcome: "forbidden" });
    return errorResponse(403, "not_assigned");
  }

  const result = await createWorksiteUpdate(db, {
    emergencyId: target.emergencyId,
    worksiteId,
    reportedBy: access.userId,
    update: body.data,
  });
  if (!result.ok) {
    updatesCounter.add(1, { outcome: "rejected" });
    return errorResponse(result.code === "worksite_not_found" ? 404 : 422, result.code);
  }
  updatesCounter.add(1, { outcome: result.created ? "created" : "retry" });
  return Response.json({ id: body.data.id }, { status: result.created ? 201 : 200 });
}
