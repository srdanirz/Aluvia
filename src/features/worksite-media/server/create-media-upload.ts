import "server-only";

import { sql } from "drizzle-orm";

import type { Database, Executor } from "@/shared/db/types";

import { MEDIA_LIMITS, type MediaUpload } from "../schemas";

// A pending upload holds its slot this long; past it the browser gave up and the slot frees
// (the scheduled cleanup deletes the row later). Covers a 50 MB video on a slow link.
export const PENDING_SLOT_MINUTES = 60;

export type CreateMediaUploadResult =
  | { ok: true; emergencyId: string; worksiteId: string; status: "pending" | "ready" }
  | { ok: false; code: "worksite_not_found" | "media_limit_reached" };

/**
 * Reserves a slot in a home's gallery for one photo or video, before the browser uploads it.
 * `target` is the home's id or the id of the report that created it: a report near an official
 * parcel ends on the parcel, and the outbox still holds the report's id (report_receipts).
 *
 * The per-home limits (5 photos, 1 video, hidden ones not counted) are decided by the database:
 * the home's row is locked, so two uploads to one home queue up and the count cannot be passed.
 * Idempotent by the upload's id: a retry for the same home answers its current status.
 */
export async function createMediaUpload(
  database: Database,
  {
    slug,
    target,
    uploadedBy,
    upload,
  }: { slug: string; target: string; uploadedBy: string | null; upload: MediaUpload },
): Promise<CreateMediaUploadResult> {
  return database.transaction(async (tx) => {
    const [home] = await tx.execute<{ id: string; emergency_id: string }>(sql`
      SELECT w.id, w.emergency_id
      FROM worksites w
      JOIN emergencies e ON e.id = w.emergency_id
      WHERE e.slug = ${slug} AND e.status = 'open'
        AND w.id = coalesce((SELECT r.worksite_id FROM report_receipts r WHERE r.id = ${target}), ${target}::uuid)
      FOR UPDATE OF w
    `);
    if (!home) return { ok: false, code: "worksite_not_found" };

    const limit = MEDIA_LIMITS[upload.kind].perHome;
    const [inserted] = await tx.execute<{ id: string }>(sql`
      INSERT INTO worksite_media (id, emergency_id, worksite_id, kind, content_type, size_bytes, duration_seconds, uploaded_by)
      SELECT ${upload.id}, ${home.emergency_id}, ${home.id}, ${upload.kind}, ${upload.contentType},
        ${upload.sizeBytes}, ${upload.durationSeconds}, ${uploadedBy}
      WHERE (
        SELECT count(*) FROM worksite_media m
        WHERE m.worksite_id = ${home.id} AND m.kind = ${upload.kind} AND m.hidden_at IS NULL
          AND (m.status = 'ready' OR m.created_at > now() - make_interval(mins => ${PENDING_SLOT_MINUTES}))
      ) < ${limit}
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `);
    if (inserted) return { ok: true, emergencyId: home.emergency_id, worksiteId: home.id, status: "pending" };

    // Not inserted: a retry of this same upload, or the home is full. The decision is made; this
    // read only picks the answer, and only for the home the caller named.
    const [existing] = await tx.execute<{ status: "pending" | "ready" }>(sql`
      SELECT status FROM worksite_media WHERE id = ${upload.id} AND worksite_id = ${home.id}
    `);
    if (existing)
      return { ok: true, emergencyId: home.emergency_id, worksiteId: home.id, status: existing.status };
    return { ok: false, code: "media_limit_reached" };
  });
}

/** Records who uploaded an item when they were signed in; anonymous uploads stay null. */
export async function creditMediaUploader(
  database: Executor,
  mediaId: string,
  userId: string,
): Promise<void> {
  await database.execute(sql`
    UPDATE worksite_media SET uploaded_by = ${userId} WHERE id = ${mediaId} AND uploaded_by IS NULL
  `);
}
