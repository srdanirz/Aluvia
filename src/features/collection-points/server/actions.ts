"use server";

import { updateTag } from "next/cache";

import { trackServerEvent } from "@/shared/analytics/server";
import { normalizePhone } from "@/shared/auth/phone";
import { db } from "@/shared/db/client";

import {
  createCollectionPointSchema,
  removeCollectionPointSchema,
  updateCollectionPointSchema,
} from "../schemas";
import { createCollectionPoint, removeCollectionPoint, updateCollectionPoint } from "./collection-points";
import { collectionPointsTag } from "./map-collection-points";
import { findEditor } from "./policy";

export type CollectionPointResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_input"
        | "invalid_phone"
        | "invalid_supply_type"
        | "not_found"
        | "forbidden"
        | "stale_version";
    };

export async function createCollectionPointAction(input: unknown): Promise<CollectionPointResult> {
  const parsed = createCollectionPointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const { slug, phone: typedPhone, ...point } = parsed.data;
  const phone = typedPhone ? normalizePhone(typedPhone) : null;
  if (typedPhone && !phone) return { ok: false, code: "invalid_phone" };
  const editor = await findEditor(slug);
  if (!editor.ok) return editor;
  const result = await createCollectionPoint(db, {
    ...point,
    phone,
    emergencyId: editor.emergencyId,
    actorId: editor.actorId,
  });
  if (!result.ok) return result;
  updateTag(collectionPointsTag(slug));
  trackServerEvent(
    "collection_point_created",
    { emergencyId: editor.emergencyId, acceptsCount: point.accepts.length },
    { distinctId: editor.actorId },
  );
  return { ok: true };
}

export async function updateCollectionPointAction(input: unknown): Promise<CollectionPointResult> {
  const parsed = updateCollectionPointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const { slug, ...change } = parsed.data;
  const editor = await findEditor(slug);
  if (!editor.ok) return editor;
  const result = await updateCollectionPoint(db, {
    ...change,
    emergencyId: editor.emergencyId,
    actorId: editor.actorId,
  });
  if (!result.ok) return result;
  updateTag(collectionPointsTag(slug));
  trackServerEvent(
    "collection_point_updated",
    { emergencyId: editor.emergencyId, status: change.status },
    { distinctId: editor.actorId },
  );
  return { ok: true };
}

export async function removeCollectionPointAction(input: unknown): Promise<CollectionPointResult> {
  const parsed = removeCollectionPointSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const editor = await findEditor(parsed.data.slug);
  if (!editor.ok) return editor;
  const removed = await removeCollectionPoint(db, {
    id: parsed.data.id,
    emergencyId: editor.emergencyId,
    actorId: editor.actorId,
  });
  if (!removed) return { ok: false, code: "not_found" };
  updateTag(collectionPointsTag(parsed.data.slug));
  trackServerEvent(
    "collection_point_removed",
    { emergencyId: editor.emergencyId },
    { distinctId: editor.actorId },
  );
  return { ok: true };
}
