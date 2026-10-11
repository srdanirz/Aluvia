import { type SQL, sql } from "drizzle-orm";

/**
 * Where a media item's objects live in the bucket (ADR 0020). The browser's original goes under
 * `uploads/`, which a lifecycle rule empties after a day whatever happens to the app; the
 * re-encoded copy the public sees goes under `media/`. Both carry the emergency, so one
 * emergency's objects can be listed apart.
 */
export const ORIGINAL_PREFIX = "uploads/";
export const PUBLIC_PREFIX = "media/";

export function originalObjectKey(emergencyId: string, mediaId: string): string {
  return `${ORIGINAL_PREFIX}${emergencyId}/${mediaId}`;
}

export function publicObjectKey(emergencyId: string, mediaId: string, extension: string): string {
  return `${PUBLIC_PREFIX}${emergencyId}/${mediaId}.${extension}`;
}

/** originalObjectKey in SQL, for a worksite_media row aliased `m`; the two must agree. */
export function originalObjectKeySql(alias: string): SQL {
  return sql.raw(`'${ORIGINAL_PREFIX}' || ${alias}.emergency_id || '/' || ${alias}.id`);
}
