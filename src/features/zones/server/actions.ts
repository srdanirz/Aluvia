"use server";

import { updateTag } from "next/cache";

import { db } from "@/shared/db/client";

import { createZoneSchema, removeZoneSchema } from "../schemas";
import { zonesTag } from "./map-zones";
import { findDrawer } from "./policy";
import { insertZone, removeZone } from "./zones";

export type ZoneResult = { ok: true } | { ok: false; code: "invalid_input" | "not_found" | "forbidden" };

export async function createZoneAction(input: unknown): Promise<ZoneResult> {
  const parsed = createZoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const drawer = await findDrawer(parsed.data.slug);
  if (!drawer.ok) return drawer;
  const { id, kind, note, ring, slug } = parsed.data;
  await insertZone(db, {
    id,
    emergencyId: drawer.emergencyId,
    kind,
    note: note || null,
    ring,
    actorId: drawer.actorId,
  });
  updateTag(zonesTag(slug));
  return { ok: true };
}

export async function removeZoneAction(input: unknown): Promise<ZoneResult> {
  const parsed = removeZoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const drawer = await findDrawer(parsed.data.slug);
  if (!drawer.ok) return drawer;
  const removed = await removeZone(db, {
    id: parsed.data.id,
    emergencyId: drawer.emergencyId,
    actorId: drawer.actorId,
  });
  if (!removed) return { ok: false, code: "not_found" };
  updateTag(zonesTag(parsed.data.slug));
  return { ok: true };
}
