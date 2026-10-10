import { createChannelAdapters } from "@/features/notifications/channels/registry";
import { getNotificationsEnv } from "@/features/notifications/server/config";
import { dispatchNotifications } from "@/features/notifications/server/dispatch";
import { db } from "@/shared/db/client";
import { isSchedulerRequest } from "@/shared/scheduler-auth";

// Cloud Scheduler calls this every minute (ADR 0007). Rounds stop starting after this budget so
// the request ends well inside Cloud Run's timeout and before the next call.
const TIME_BUDGET_MS = 45_000;
const PATH = "/api/v1/notifications/dispatch";

export async function POST(request: Request) {
  const { APP_URL } = getNotificationsEnv();
  // The scheduler signs its token for the endpoint's public URL (its default OIDC audience).
  if (!(await isSchedulerRequest(request, `${APP_URL}${PATH}`))) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const summary = await dispatchNotifications({
    db,
    adapters: createChannelAdapters(APP_URL),
    appUrl: APP_URL,
    clock: () => new Date(),
    deadline: new Date(startedAt + TIME_BUDGET_MS),
  });
  return Response.json(summary);
}
