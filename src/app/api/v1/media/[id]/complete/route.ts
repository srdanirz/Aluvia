import type { NextRequest } from "next/server";

import { completeMediaUploadRoute } from "@/features/worksite-media/server";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/media/[id]/complete">) {
  const { id } = await ctx.params;
  return completeMediaUploadRoute(request, id);
}
