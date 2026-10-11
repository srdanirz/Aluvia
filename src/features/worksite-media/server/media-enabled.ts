import "server-only";

import { getMediaStore } from "@/shared/storage/media-store";

/** Whether this deployment has a media bucket; forms and pages offer photos only then. */
export function isMediaEnabled(): boolean {
  return getMediaStore() !== null;
}
