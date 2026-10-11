import { saveBlob } from "@/shared/offline/blob-store";
import { enqueueLater, flushOutbox } from "@/shared/offline/outbox";

import type { MediaUpload } from "../schemas";
import type { PickedMedia } from "./prepare-media";

/**
 * Queues picked photos and videos for a home in the outbox: each file first in IndexedDB, then
 * its entry, in order, and starts a send round. Resolves when the round ends; a caller that must
 * not wait (the report form) does not await it. `target` is the home's id or the id of the report
 * that creates it: a report queued without signal goes out first, its media after it (ADR 0020).
 */
export async function enqueueMedia({
  slug,
  target,
  items,
}: {
  slug: string;
  target: string;
  items: PickedMedia[];
}): Promise<void> {
  await Promise.all(items.map((item) => saveBlob(item.id, item.blob)));
  for (const item of items) {
    const body: MediaUpload = {
      id: item.id,
      kind: item.kind,
      contentType: item.contentType,
      sizeBytes: item.blob.size,
      durationSeconds: item.durationSeconds,
    };
    enqueueLater({
      id: item.id,
      kind: "worksite_media",
      url: `/api/v1/emergencies/${slug}/worksites/${target}/media`,
      body,
    });
  }
  await flushOutbox();
}
