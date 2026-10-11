import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/shared/db/client";
import type { Executor } from "@/shared/db/types";
import { getMediaStore, type MediaStore, READ_URL_SECONDS } from "@/shared/storage/media-store";

import { MEDIA_LIMITS, type MediaKind } from "../schemas";

export type WorksiteMediaItem = {
  id: string;
  kind: MediaKind;
  contentType: string;
  /** Short-lived signed GET of the re-encoded copy. */
  url: string;
  hidden: boolean;
  createdAt: Date;
};

// The most a gallery holds: the per-home limits, plus hidden items a coordinator still sees.
const GALLERY_MAX = 50;

/**
 * A home's ready photos and videos, oldest first, with signed read URLs (ADR 0020). The public
 * never gets hidden items; a coordinator (`includeHidden`) gets them marked. One query; the
 * signatures are bucket calls, made in parallel and cached per instance for most of their life.
 * Empty when media is off (no bucket configured).
 */
export async function listWorksiteMedia(
  { worksiteId, includeHidden }: { worksiteId: string; includeHidden: boolean },
  database: Executor = db,
  store: MediaStore | null = getMediaStore(),
): Promise<WorksiteMediaItem[]> {
  if (!store) return [];
  const rows = await database.execute<{
    id: string;
    kind: MediaKind;
    content_type: string;
    object_key: string;
    hidden: boolean;
    created_at: Date | string;
  }>(sql`
    SELECT id, kind, content_type, object_key, hidden_at IS NOT NULL AS hidden, created_at
    FROM worksite_media
    WHERE worksite_id = ${worksiteId} AND status = 'ready'
      ${includeHidden ? sql`` : sql`AND hidden_at IS NULL`}
    ORDER BY created_at, id
    LIMIT ${includeHidden ? GALLERY_MAX : MEDIA_LIMITS.image.perHome + MEDIA_LIMITS.video.perHome}
  `);
  const urls = await Promise.all(rows.map((row) => signReadCached(store, row.object_key)));
  return rows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    contentType: row.content_type,
    url: urls[index]!,
    hidden: row.hidden,
    createdAt: new Date(row.created_at),
  }));
}

// A URL is reused for two thirds of its life, so a page rendered at the end still gets minutes.
const CACHE_MS = (READ_URL_SECONDS * 1000 * 2) / 3;
const CACHE_MAX = 2000;
const readUrls = new Map<string, { url: string; until: number }>();

async function signReadCached(store: MediaStore, key: string): Promise<string> {
  const now = Date.now();
  const cached = readUrls.get(key);
  if (cached && cached.until > now) return cached.url;
  const url = await store.signRead(key);
  if (readUrls.size >= CACHE_MAX) readUrls.clear();
  readUrls.set(key, { url, until: now + CACHE_MS });
  return url;
}
