import "server-only";

import { meter } from "@/shared/observability/metrics";

/** Uploads by step (`requested`, `completed`) and outcome; a spike of `invalid` or `failed` needs a look. */
export const mediaUploadsCounter = meter.createCounter("aluvia.worksite_media.uploads", {
  unit: "{upload}",
  description: "Photo and video uploads of homes, by step, kind and outcome.",
});

/** Bucket objects deleted by the scheduled call, and deletions that failed and stay queued. */
export const mediaDeletionsCounter = meter.createCounter("aluvia.worksite_media.deletions", {
  unit: "{object}",
  description: "Queued media objects deleted from the bucket, by outcome.",
});
