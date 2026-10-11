import "server-only";

import { sql } from "drizzle-orm";

import type { Database, Executor } from "@/shared/db/types";
import { originalObjectKey, publicObjectKey } from "@/shared/storage/media-keys";
import { MediaNotFoundError, type MediaStore, MediaTooLargeError } from "@/shared/storage/media-store";

import { MEDIA_LIMITS, type MediaKind } from "../schemas";
import { InvalidMediaError, type ProcessedMedia, processImage, processVideo } from "./process-media";

export type CompleteMediaUploadResult =
  | { ok: true; status: "ready"; kind: MediaKind; published: boolean }
  | { ok: false; code: "media_not_found" | "upload_missing" | "invalid_media" };

/**
 * Finishes an upload: reads the browser's original from the bucket, re-encodes it without
 * metadata, stores the public copy and marks the item ready (ADR 0020). Idempotent: a retry of a
 * ready item answers ready without touching the bucket. The original is queued for deletion in
 * the same transaction that marks the item ready; an original that does not decode is refused,
 * its row dropped and its object queued, so the slot frees.
 *
 * The bucket calls run outside any transaction (STYLEGUIDE, Robustez); the write that publishes
 * the item is conditional on it still being pending, so two concurrent completions publish once.
 */
export async function completeMediaUpload(
  database: Database,
  store: MediaStore,
  { mediaId }: { mediaId: string },
): Promise<CompleteMediaUploadResult> {
  const [media] = await database.execute<{
    emergency_id: string;
    kind: MediaKind;
    status: "pending" | "ready";
    content_type: string;
  }>(sql`SELECT emergency_id, kind, status, content_type FROM worksite_media WHERE id = ${mediaId}`);
  if (!media) return { ok: false, code: "media_not_found" };
  if (media.status === "ready") return { ok: true, status: "ready", kind: media.kind, published: false };

  const originalKey = originalObjectKey(media.emergency_id, mediaId);
  let processed: ProcessedMedia;
  try {
    const original = await store.read(originalKey, MEDIA_LIMITS[media.kind].maxBytes);
    processed =
      media.kind === "image"
        ? await processImage(original)
        : await processVideo(original, media.content_type);
  } catch (error) {
    if (error instanceof MediaNotFoundError) return { ok: false, code: "upload_missing" };
    if (!(error instanceof InvalidMediaError || error instanceof MediaTooLargeError)) throw error;
    await database.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM worksite_media WHERE id = ${mediaId} AND status = 'pending'`);
      await queueObjectDeletion(tx, originalKey);
    });
    return { ok: false, code: "invalid_media" };
  }

  const publicKey = publicObjectKey(media.emergency_id, mediaId, processed.extension);
  await store.write(publicKey, processed.data, processed.contentType);
  const published = await database.transaction(async (tx) => {
    const updated = await tx.execute(sql`
      UPDATE worksite_media
      SET status = 'ready', object_key = ${publicKey}, content_type = ${processed.contentType},
        size_bytes = ${processed.data.length}, duration_seconds = ${processed.durationSeconds}, ready_at = now()
      WHERE id = ${mediaId} AND status = 'pending'
      RETURNING id
    `);
    await queueObjectDeletion(tx, originalKey);
    // The row went meanwhile (purged, abandoned): the copy just written must not outlive it.
    await tx.execute(sql`
      INSERT INTO media_object_deletions (object_key)
      SELECT ${publicKey}
      WHERE NOT EXISTS (SELECT 1 FROM worksite_media WHERE id = ${mediaId} AND object_key = ${publicKey})
      ON CONFLICT (object_key) DO NOTHING
    `);
    return updated.length > 0;
  });
  return { ok: true, status: "ready", kind: media.kind, published };
}

/** Queues one bucket object for the scheduled deletion (deleteQueuedMediaObjects). */
export async function queueObjectDeletion(database: Executor, key: string) {
  await database.execute(sql`
    INSERT INTO media_object_deletions (object_key) VALUES (${key}) ON CONFLICT (object_key) DO NOTHING
  `);
}
