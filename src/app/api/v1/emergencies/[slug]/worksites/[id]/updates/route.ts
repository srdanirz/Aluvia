import type { NextRequest } from "next/server";

import { recordWorksiteUpdate } from "@/features/worksite-updates/server";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/v1/emergencies/[slug]/worksites/[id]/updates">,
) {
  const { slug, id } = await ctx.params;
  return recordWorksiteUpdate(request, slug, id);
}
