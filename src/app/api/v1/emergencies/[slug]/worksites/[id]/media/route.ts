import type { NextRequest } from "next/server";

import { requestMediaUpload } from "@/features/worksite-media/server";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/emergencies/[slug]/worksites/[id]/media">,
) {
  const { slug, id } = await ctx.params;
  return requestMediaUpload(request, slug, id);
}
