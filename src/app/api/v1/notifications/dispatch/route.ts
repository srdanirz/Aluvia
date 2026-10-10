import { timingSafeEqual } from "node:crypto";

import { dispatchNotifications } from "@/features/notifications/server/dispatch";
import { getNotificationsEnv } from "@/features/notifications/server/config";
import { createChannelAdapters } from "@/features/notifications/channels/registry";
import { db } from "@/shared/db/client";

// Cloud Scheduler calls this every minute (ADR 0007). Rounds stop starting after this budget so
// the request ends well inside Cloud Run's timeout and before the next call.
const TIME_BUDGET_MS = 45_000;

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("authorization"))) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const { APP_URL } = getNotificationsEnv();
  const summary = await dispatchNotifications({
    db,
    adapters: createChannelAdapters(APP_URL),
    appUrl: APP_URL,
    clock: () => new Date(),
    deadline: new Date(startedAt + TIME_BUDGET_MS),
  });
  return Response.json(summary);
}

function isAuthorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${getNotificationsEnv().NOTIFICATIONS_DISPATCH_TOKEN}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
