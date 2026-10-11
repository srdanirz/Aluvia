import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import sharp from "sharp";

import { MAX_VIDEO_SECONDS } from "../schemas";

const run = promisify(execFile);

/**
 * Turns a browser's original into the copy the public sees (ADR 0020). Images are decoded and
 * re-encoded, which drops every metadata block (EXIF with GPS, XMP, IPTC): sharp writes none unless
 * asked. Videos are remuxed by ffmpeg without re-encoding, dropping container and stream
 * metadata (the phone's GPS lives there). Anything that does not decode is refused.
 */
export type ProcessedMedia = {
  data: Buffer;
  contentType: string;
  extension: string;
  durationSeconds: number | null;
};

export class InvalidMediaError extends Error {}

// Longest side of the web copy: sharp on a phone screen, a few hundred KB.
const WEB_IMAGE_PIXELS = 1600;
// A 48 MP phone photo is ~48 M pixels; anything far past it is a decompression bomb.
const MAX_INPUT_PIXELS = 100_000_000;
const FFMPEG_TIMEOUT_MS = 30_000;

export async function processImage(original: Buffer): Promise<ProcessedMedia> {
  try {
    const data = await sharp(original, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
      // Applies the EXIF orientation to the pixels, since the tag itself is dropped.
      .rotate()
      .resize({ width: WEB_IMAGE_PIXELS, height: WEB_IMAGE_PIXELS, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    return { data, contentType: "image/webp", extension: "webp", durationSeconds: null };
  } catch (error) {
    throw new InvalidMediaError("image_decode_failed", { cause: error });
  }
}

export async function processVideo(original: Buffer, contentType: string): Promise<ProcessedMedia> {
  const webm = contentType === "video/webm";
  const extension = webm ? "webm" : "mp4";
  const dir = await mkdtemp(join(tmpdir(), "aluvia-media-"));
  try {
    const input = join(dir, "input");
    const output = join(dir, `output.${extension}`);
    await writeFile(input, original);
    const durationSeconds = await probeDuration(input);
    if (durationSeconds > MAX_VIDEO_SECONDS) throw new InvalidMediaError("video_too_long");
    try {
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-i",
          input,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c",
          "copy",
          "-map_metadata",
          "-1",
          "-map_metadata:s:v",
          "-1",
          "-map_metadata:s:a",
          "-1",
          "-map_chapters",
          "-1",
          ...(webm ? [] : ["-movflags", "+faststart"]),
          "-f",
          webm ? "webm" : "mp4",
          output,
        ],
        { timeout: FFMPEG_TIMEOUT_MS },
      );
    } catch (error) {
      throw new InvalidMediaError("video_remux_failed", { cause: error });
    }
    return {
      data: await readFile(output),
      contentType: webm ? "video/webm" : "video/mp4",
      extension,
      durationSeconds,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function probeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await run(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration", "-of", "csv=p=0", path],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds)) throw new InvalidMediaError("video_without_duration");
    return seconds;
  } catch (error) {
    if (error instanceof InvalidMediaError) throw error;
    throw new InvalidMediaError("video_probe_failed", { cause: error });
  }
}
