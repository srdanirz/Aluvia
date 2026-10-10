import type { NextRequest } from "next/server";

import { parseMapCellsQuery } from "@/features/map/schemas";
import { listMapCells } from "@/features/map/server/map-cells";
import { reportWorksite } from "@/features/worksites/server";

// Map reads arrive in bursts when a link goes around WhatsApp. A few seconds of shared caching
// absorb the burst; a claim shows up on the map within that window.
const CACHE_CONTROL = "public, max-age=5, s-maxage=10, stale-while-revalidate=30";

/** `GET ?bbox=west,south,east,north&zoom=z`: the public map cells (features/map/server/map-cells.ts). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/emergencies/[slug]/worksites">) {
  const { slug } = await ctx.params;
  const parsed = parseMapCellsQuery(slug, request.nextUrl.searchParams);
  // A malformed query is a bad request; a valid one asking for too much is unprocessable.
  if (!parsed.ok)
    return Response.json({ code: parsed.code }, { status: parsed.code === "invalid_query" ? 400 : 422 });

  const cells = await listMapCells({ ...parsed.data, now: new Date() });
  if (!cells) return Response.json({ code: "emergency_not_found" }, { status: 404 });
  return Response.json(cells, { headers: { "Cache-Control": CACHE_CONTROL } });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/v1/emergencies/[slug]/worksites">) {
  const { slug } = await ctx.params;
  return reportWorksite(request, slug);
}
