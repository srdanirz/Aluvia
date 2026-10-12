import { z } from "zod";

import { collectionPointStatus } from "@/shared/db/schema";

export type CollectionPointStatus = (typeof collectionPointStatus.enumValues)[number];
export const COLLECTION_POINT_STATUSES = collectionPointStatus.enumValues;

const slug = z.string().min(1).max(100);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);
// Supply keys, deduplicated: the database counts them against the catalog.
const supplyKeys = z
  .array(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/))
  .max(40)
  .transform((keys) => [...new Set(keys)]);

/** A new point: where it is, when it opens and what it takes. It starts receiving. */
export const createCollectionPointSchema = z.object({
  id: z.uuid(),
  slug,
  name: z.string().trim().min(1).max(80),
  lng: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
  address: optionalText(200),
  openingHours: optionalText(120),
  accepts: supplyKeys,
  // As typed; the action turns it into E.164 or rejects it.
  phone: optionalText(30),
});

/** A status change, with the version the coordinator saw so another edit is never overwritten. */
export const updateCollectionPointSchema = z.object({
  id: z.uuid(),
  slug,
  version: z.number().int().min(1),
  status: z.enum(COLLECTION_POINT_STATUSES),
  statusNote: optionalText(200),
  accepts: supplyKeys,
  // What the point has too much of: shown publicly as "no traigas".
  surplus: supplyKeys,
});

export const removeCollectionPointSchema = z.object({ id: z.uuid(), slug });
