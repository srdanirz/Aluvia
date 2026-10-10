import { releaseExpiredClaims } from "@/features/work-items/server";
import { getWorkItemsEnv } from "@/features/work-items/server/config";
import { db } from "@/shared/db/client";
import { isSchedulerRequest } from "@/shared/scheduler-auth";

const PATH = "/api/v1/work-items/release-expired";
// Cloud Scheduler calls this every minute (issue #12). Rounds stop starting after this budget so
// the request ends well inside Cloud Run's timeout and before the next call.
const TIME_BUDGET_MS = 45_000;

/** Releases lapsed "Voy para allá" reservations. A job endpoint: Cloud Scheduler only, no session. */
export async function POST(request: Request) {
  // Behind the load balancer request.url is internal; the scheduler signed the public URL.
  if (!(await isSchedulerRequest(request, `${getWorkItemsEnv().APP_URL}${PATH}`))) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const released = await releaseExpiredClaims(db, { deadline: new Date(Date.now() + TIME_BUDGET_MS) });
  return Response.json({ released });
}
