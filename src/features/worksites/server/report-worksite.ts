import "server-only";

import { getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { env } from "@/shared/env";
import { errorResponse, parseJsonBody } from "@/shared/http";
import { clientIpKey, hitRateLimit } from "@/shared/rate-limit";

import { worksiteReportSchema } from "../schemas";
import { createWorksites } from "./create-worksites";
import { reportsCounter } from "./metrics";
import { reportSourceFor } from "./policy";
import { findOpenEmergencyId } from "./queries";

// Generous on purpose: Chilean mobile networks put many phones behind one IP (CGNAT), and a
// coordinator on a shelter's wifi can report dozens of homes in an hour (SECURITY.md).
const REPORTS_PER_WINDOW = 60;
const WINDOW_SECONDS = 600;

/**
 * POST /api/v1/emergencies/[slug]/worksites: reports a home, no account needed. Idempotent by
 * the body's client-generated id, because the offline outbox may send one report several times:
 * every time after the first answers 200 with the same id and changes nothing.
 */
export async function reportWorksite(request: Request, slug: string): Promise<Response> {
  const ipKey = clientIpKey(request.headers, {
    secret: env.RATE_LIMIT_SECRET,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  const allowed = await hitRateLimit(db, {
    key: `worksite_report:${ipKey}`,
    limit: REPORTS_PER_WINDOW,
    windowSeconds: WINDOW_SECONDS,
  });
  if (!allowed) {
    reportsCounter.add(1, { source: "unknown", outcome: "rate_limited" });
    return errorResponse(429, "rate_limited");
  }

  const body = await parseJsonBody(request, worksiteReportSchema);
  if (!body.ok) {
    reportsCounter.add(1, { source: "unknown", outcome: "rejected" });
    return body.response;
  }

  const emergencyId = await findOpenEmergencyId(slug);
  if (!emergencyId) return errorResponse(404, "emergency_not_found");

  const source = reportSourceFor(await getEmergencyAccess(emergencyId));
  const result = await createWorksites(db, { emergencyId, source, reports: [body.data] });
  if (!result.ok) {
    reportsCounter.add(1, { source, outcome: "rejected" });
    return errorResponse(422, result.code);
  }

  const created = result.created.length > 0;
  reportsCounter.add(1, { source, outcome: created ? "created" : "retry" });
  return Response.json({ id: body.data.id }, { status: created ? 201 : 200 });
}
