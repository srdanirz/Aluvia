import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/shared/db/client";

import { listOpenEmergencies, type OpenEmergency } from "./queries";

/** Cache tag of the open-emergency list; the admin actions that open or close one update it. */
export const OPEN_EMERGENCIES_TAG = "open-emergencies";

/** The open emergencies the home page routes to. Cached until an emergency opens or closes. */
export async function findOpenEmergencies(locale: string): Promise<OpenEmergency[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(OPEN_EMERGENCIES_TAG);
  return listOpenEmergencies(db, locale);
}
