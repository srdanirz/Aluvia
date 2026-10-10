import { z } from "zod";

import { getNotificationsEnv } from "@/features/notifications/server/config";
import { openNotification } from "@/features/notifications/server/links";
import { db } from "@/shared/db/client";

/** The short link in every notice (ADR 0007, 0010): marks it read and redirects to its page. */
export async function GET(_request: Request, ctx: RouteContext<"/n/[id]">) {
  const { id } = await ctx.params;
  const path = z.uuid().safeParse(id).success ? await openNotification(db, id, new Date()) : null;
  // Unknown or stale links land on the home page, never on an error that confirms an id.
  // no-store: the redirect depends on who the id belongs to and marks it read, so no cache may replay it.
  return new Response(null, {
    status: 302,
    headers: { Location: `${getNotificationsEnv().APP_URL}${path ?? "/"}`, "Cache-Control": "no-store" },
  });
}
