import { z } from "zod";

/**
 * What a home's gallery accepts (ADR 0020). The browser re-encodes photos to JPEG before upload
 * (smaller on 3G, and HEIC decodes only there), so images arrive as JPEG, PNG or WebP. Videos keep
 * their container; the server only strips metadata.
 */
export const MEDIA_LIMITS = {
  image: {
    perHome: 5,
    // A re-encoded phone photo is 0.5 to 3 MB; this leaves room for a PNG screenshot.
    maxBytes: 15 * 1024 * 1024,
    types: ["image/jpeg", "image/png", "image/webp"],
  },
  video: {
    perHome: 1,
    maxBytes: 50 * 1024 * 1024,
    maxSeconds: 30,
    types: ["video/mp4", "video/quicktime", "video/webm"],
  },
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

// Phones round a 30 s clip up by a few frames.
const DURATION_TOLERANCE_SECONDS = 0.5;

export const mediaUploadSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.enum(["image", "video"]),
    contentType: z.string().max(100),
    sizeBytes: z.int().min(1),
    durationSeconds: z.number().min(0).nullable().default(null),
  })
  .superRefine((upload, ctx) => {
    const limits = MEDIA_LIMITS[upload.kind];
    if (!(limits.types as readonly string[]).includes(upload.contentType)) {
      ctx.addIssue({ code: "custom", path: ["contentType"], message: "media_type_not_allowed" });
    }
    if (upload.sizeBytes > limits.maxBytes) {
      ctx.addIssue({ code: "custom", path: ["sizeBytes"], message: "media_too_large" });
    }
    if (
      upload.kind === "video" &&
      (upload.durationSeconds === null ||
        upload.durationSeconds > MEDIA_LIMITS.video.maxSeconds + DURATION_TOLERANCE_SECONDS)
    ) {
      ctx.addIssue({ code: "custom", path: ["durationSeconds"], message: "video_too_long" });
    }
    if (upload.kind === "image" && upload.durationSeconds !== null) {
      ctx.addIssue({ code: "custom", path: ["durationSeconds"], message: "invalid_input" });
    }
  });

export type MediaUpload = z.infer<typeof mediaUploadSchema>;

export const MAX_VIDEO_SECONDS = MEDIA_LIMITS.video.maxSeconds + DURATION_TOLERANCE_SECONDS;

export const mediaVisibilitySchema = z.strictObject({ mediaId: z.uuid(), hidden: z.boolean() });
