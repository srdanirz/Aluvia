import "server-only";

import { notFound } from "next/navigation";

import { db } from "@/shared/db/client";

import { findActiveNoticeText } from "./notices";
import { requirePlatformAdmin } from "./policy";
import {
  findDisasterType,
  findEmergency,
  listAllDisasterTypes,
  listDisasterTypes,
  listEmergencies,
} from "./queries";

// One loader per admin view: the policy first, then everything the view shows, in parallel.
// Pages call these and never touch the database handle.

const cursorOf = (after: string | string[] | undefined) => (typeof after === "string" ? after : undefined);

export async function loadEmergencyList(after: string | string[] | undefined) {
  await requirePlatformAdmin();
  return listEmergencies(db, { after: cursorOf(after) });
}

export async function loadDisasterTypeList(after: string | string[] | undefined) {
  await requirePlatformAdmin();
  return listDisasterTypes(db, { after: cursorOf(after) });
}

/** The new-emergency form's options: every disaster type, following the list's pages to the end. */
export async function loadEmergencyFormOptions() {
  await requirePlatformAdmin();
  return { disasterTypes: await listAllDisasterTypes(db), timeZones: Intl.supportedValuesOf("timeZone") };
}

export async function loadEmergency(slug: string) {
  await requirePlatformAdmin();
  return (await findEmergency(db, slug)) ?? notFound();
}

export async function loadDisasterType(key: string) {
  await requirePlatformAdmin();
  return (await findDisasterType(db, key)) ?? notFound();
}

/** For views with no data of their own: only the policy. */
export async function requireAdminView() {
  await requirePlatformAdmin();
}

/** Public, no policy: the official notice text for an emergency's pages (ADR 0015). */
export async function loadOfficialNotice(slug: string, locale: string) {
  return findActiveNoticeText(db, slug, locale);
}
