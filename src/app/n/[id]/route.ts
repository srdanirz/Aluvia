import { z } from "zod";

import { getNotificationsEnv } from "@/features/notifications/server/config";
import { findNotificationLink } from "@/features/notifications/server/links";
import { db } from "@/shared/db/client";

/** The short link in every notice (ADR 0010): redirects to its page in the recipient's language. */
export async function GET(_request: Request, ctx: RouteContext<"/n/[id]">) {
  const { id } = await ctx.params;
  const path = z.uuid().safeParse(id).success ? await findNotificationLink(db, id) : null;
  // Unknown or stale links land on the home page, never on an error that confirms an id.
  // no-store: where it goes depends on the notice and may change with the catalog.
  return new Response(null, {
    status: 302,
    headers: { Location: `${getNotificationsEnv().APP_URL}${path ?? "/"}`, "Cache-Control": "no-store" },
  });
}
