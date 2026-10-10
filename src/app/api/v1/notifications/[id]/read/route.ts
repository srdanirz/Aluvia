import { z } from "zod";

import { markNotificationRead } from "@/features/notifications/server/links";
import { db } from "@/shared/db/client";

/**
 * The service worker reports that a push was opened (ADR 0007, "leído"). A POST, so link
 * scanners never trigger it. The id is the only credential: it reaches only the recipient's
 * browser inside the encrypted push, and marking read only cancels a fallback. The answer is the
 * same whether the id exists or not.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/v1/notifications/[id]/read">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ code: "invalid_id" }, { status: 400 });
  await markNotificationRead(db, id, new Date());
  return new Response(null, { status: 204 });
}
