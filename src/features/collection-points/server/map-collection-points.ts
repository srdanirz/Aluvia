import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/shared/db/client";

import { listActiveCollectionPoints, type MapCollectionPoints } from "./collection-points";

export const collectionPointsTag = (slug: string) => `collection-points:${slug}`;

/** The points every map viewer sees. Cached until a coordinator adds, changes or removes one. */
export async function findMapCollectionPoints(slug: string, locale: string): Promise<MapCollectionPoints> {
  "use cache";
  cacheLife("hours");
  cacheTag(collectionPointsTag(slug));
  return listActiveCollectionPoints(db, { slug, locale });
}
