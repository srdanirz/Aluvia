import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/shared/db/client";

import { listActiveZones, type MapZone } from "./zones";

export const zonesTag = (slug: string) => `zones:${slug}`;

/** The zones every map viewer sees. Cached until a coordinator draws or removes one. */
export async function findMapZones(slug: string): Promise<MapZone[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(zonesTag(slug));
  return listActiveZones(db, slug);
}
