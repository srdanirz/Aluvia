import { deleteQueuedMediaObjects, mediaDeletionsCounter } from "@/features/worksite-media/server";
import { getWorkItemsEnv } from "@/features/work-items/server/config";
import { db } from "@/shared/db/client";
import { isSchedulerRequest } from "@/shared/scheduler-auth";
import { getMediaStore } from "@/shared/storage/media-store";

const PATH = "/api/v1/media/delete-queued";

/** Deletes queued media objects from the bucket (ADR 0020). A job endpoint: Cloud Scheduler only. */
export async function POST(request: Request) {
  // Behind the load balancer request.url is internal; the scheduler signed the public URL.
  if (!(await isSchedulerRequest(request, `${getWorkItemsEnv().APP_URL}${PATH}`))) {
    return Response.json({ code: "unauthorized" }, { status: 401 });
  }
  const store = getMediaStore();
  if (!store) return Response.json({ code: "media_unavailable" }, { status: 503 });
  const { deleted, failed } = await deleteQueuedMediaObjects(db, store);
  mediaDeletionsCounter.add(deleted, { outcome: "deleted" });
  mediaDeletionsCounter.add(failed, { outcome: "failed" });
  return Response.json({ deleted, failed });
}
