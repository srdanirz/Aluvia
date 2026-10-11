import "server-only";

import { sql } from "drizzle-orm";

import type { Database } from "@/shared/db/types";
import { originalObjectKeySql } from "@/shared/storage/media-keys";
import type { MediaStore } from "@/shared/storage/media-store";
import { sqlArray } from "@/shared/db/sql-array";

import { logWarn } from "@/shared/observability/logger";

// Pending uploads older than this were abandoned (the browser never completed them).
const ABANDONED_AFTER_HOURS = 24;
// One round's deletions: GCS takes ~50 ms per delete, so a round fits well inside a minute.
const DELETE_BATCH = 200;
const DELETE_CONCURRENCY = 10;

/**
 * Called every minute by Cloud Scheduler (ADR 0020). Drops abandoned pending uploads and queues
 * their originals, then deletes a batch of queued objects from the bucket and forgets the keys
 * it deleted. Safe to run twice at once: deleting an absent object succeeds, and a key is
 * forgotten only after its object is gone.
 */
export async function deleteQueuedMediaObjects(
  database: Database,
  store: MediaStore,
): Promise<{ deleted: number; failed: number }> {
  await database.execute(sql`
    WITH abandoned AS (
      DELETE FROM worksite_media m
      WHERE m.status = 'pending' AND m.created_at < now() - make_interval(hours => ${ABANDONED_AFTER_HOURS})
      RETURNING m.id, m.emergency_id
    )
    INSERT INTO media_object_deletions (object_key)
    SELECT ${originalObjectKeySql("abandoned")} FROM abandoned
    ON CONFLICT (object_key) DO NOTHING
  `);

  const queued = await database.execute<{ object_key: string }>(sql`
    SELECT object_key FROM media_object_deletions ORDER BY queued_at LIMIT ${DELETE_BATCH}
  `);
  const keys = queued.map((row) => row.object_key);
  const { done, failed } = await removeInChunks(store, keys);
  if (done.length > 0) {
    await database.execute(
      sql`DELETE FROM media_object_deletions WHERE object_key = ANY(${sqlArray(done, "text")})`,
    );
  }
  return { deleted: done.length, failed };
}

// Bucket calls, not database calls: bounded parallelism keeps a round inside the minute, one chunk
// after the other.
async function removeInChunks(
  store: MediaStore,
  keys: string[],
): Promise<{ done: string[]; failed: number }> {
  const chunk = keys.slice(0, DELETE_CONCURRENCY);
  if (chunk.length === 0) return { done: [], failed: 0 };
  const results = await Promise.allSettled(chunk.map((key) => store.remove(key)));
  const done: string[] = [];
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === "fulfilled") done.push(chunk[index]!);
    else {
      failed += 1;
      logWarn("media_object_delete_failed", { error: String(result.reason) });
    }
  });
  const rest = await removeInChunks(store, keys.slice(DELETE_CONCURRENCY));
  return { done: [...done, ...rest.done], failed: failed + rest.failed };
}
