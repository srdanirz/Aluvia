import { MAX_VIDEO_SECONDS, MEDIA_LIMITS, type MediaKind } from "../schemas";

/** A photo or video picked on the phone, ready to queue. */
export type PickedMedia = {
  id: string;
  kind: MediaKind;
  blob: Blob;
  contentType: string;
  durationSeconds: number | null;
  /** Object URL for the preview; revoked when the item leaves the picker. */
  previewUrl: string;
};

export type PickError =
  | "media_type_not_allowed"
  | "heic_unsupported"
  | "media_too_large"
  | "video_too_long"
  | "media_limit_reached";

// iPhone photos. Safari decodes them; most other desktop browsers cannot, and the server cannot.
const isHeic = (file: File) => /^image\/hei[cf]/.test(file.type) || /\.hei[cf]$/i.test(file.name);

// Longest side sent from the phone: plenty for the 1600 px web copy, a fraction of a 12 MP photo
// on a slow link.
const UPLOAD_IMAGE_PIXELS = 2048;
const UPLOAD_JPEG_QUALITY = 0.85;

/**
 * Re-encodes a photo on the phone before it is queued: smaller to send on 3G, and the browser
 * decodes formats the server cannot (HEIC on an iPhone). Drawing to a canvas also drops EXIF;
 * the server re-encodes again and does not trust this step.
 */
async function shrinkImage(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_IMAGE_PIXELS / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await canvas.convertToBlob({ type: "image/jpeg", quality: UPLOAD_JPEG_QUALITY });
  } catch {
    return null;
  }
}

function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}

/**
 * Turns picked files into queueable items, checking the same limits the server enforces (type,
 * size, 30 s, 5 photos and 1 video including what is already picked). A file that fails comes
 * back as its error code, so the picker says why it was left out.
 */
export async function prepareFiles(
  files: File[],
  current: PickedMedia[],
): Promise<{ items: PickedMedia[]; errors: PickError[] }> {
  const count = (kind: MediaKind) => current.filter((item) => item.kind === kind).length;
  const room = {
    image: MEDIA_LIMITS.image.perHome - count("image"),
    video: MEDIA_LIMITS.video.perHome - count("video"),
  };
  const results = await Promise.all(
    files.map(async (file): Promise<PickedMedia | PickError> => {
      const kind: MediaKind | null = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : null;
      if (!kind) return "media_type_not_allowed";
      if (kind === "image") {
        const blob = await shrinkImage(file);
        if (!blob) return isHeic(file) ? "heic_unsupported" : "media_type_not_allowed";
        if (blob.size > MEDIA_LIMITS.image.maxBytes) return "media_too_large";
        return {
          id: crypto.randomUUID(),
          kind,
          blob,
          contentType: "image/jpeg",
          durationSeconds: null,
          previewUrl: URL.createObjectURL(blob),
        };
      }
      if (!(MEDIA_LIMITS.video.types as readonly string[]).includes(file.type))
        return "media_type_not_allowed";
      if (file.size > MEDIA_LIMITS.video.maxBytes) return "media_too_large";
      const durationSeconds = await readVideoDuration(file);
      if (durationSeconds === null || durationSeconds > MAX_VIDEO_SECONDS) return "video_too_long";
      return {
        id: crypto.randomUUID(),
        kind,
        blob: file,
        contentType: file.type,
        durationSeconds,
        previewUrl: URL.createObjectURL(file),
      };
    }),
  );
  const items: PickedMedia[] = [];
  const errors: PickError[] = [];
  for (const result of results) {
    if (typeof result === "string") errors.push(result);
    else if (room[result.kind] > 0) {
      room[result.kind] -= 1;
      items.push(result);
    } else {
      URL.revokeObjectURL(result.previewUrl);
      errors.push("media_limit_reached");
    }
  }
  return { items, errors: [...new Set(errors)] };
}
