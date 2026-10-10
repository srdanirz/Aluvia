import type { NextRequest } from "next/server";

import { reportWorksite } from "@/features/worksites/server";

export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/emergencies/[slug]/worksites">) {
  const { slug } = await ctx.params;
  return reportWorksite(request, slug);
}
