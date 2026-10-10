import { z } from "zod";

import { zoneKind } from "@/shared/db/schema";

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** A perimeter drawn on the map: an open ring of points (the server closes it). */
export const createZoneSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1).max(100),
  kind: z.enum(zoneKind.enumValues),
  note: z.string().trim().max(200).nullable(),
  ring: z.array(lngLat).min(3).max(200),
});

export const removeZoneSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1).max(100),
});

export type ZoneKind = (typeof zoneKind.enumValues)[number];
