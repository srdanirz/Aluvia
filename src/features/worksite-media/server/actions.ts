"use server";

import { trackServerEvent } from "@/shared/analytics/server";
import { getCurrentUser } from "@/shared/auth";
import { db } from "@/shared/db/client";

import { mediaVisibilitySchema } from "../schemas";
import { setWorksiteMediaHidden } from "./set-media-hidden";

export type MediaVisibilityResult =
  { ok: true } | { ok: false; code: "invalid_input" | "sign_in_required" | "media_not_found" };

/**
 * Hides a photo or video from the public, or shows it again. The statement itself checks that the
 * person coordinates the item's emergency (or is a platform admin); anyone else gets
 * `media_not_found`, so the action does not confirm which ids exist.
 */
export async function setWorksiteMediaHiddenAction(input: unknown): Promise<MediaVisibilityResult> {
  const parsed = mediaVisibilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "sign_in_required" };
  const result = await setWorksiteMediaHidden(db, user.id, parsed.data);
  if (result.ok)
    trackServerEvent("worksite_media_hidden", { hidden: parsed.data.hidden }, { distinctId: user.id });
  return result;
}
