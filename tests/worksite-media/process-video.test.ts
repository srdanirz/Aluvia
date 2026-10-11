import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { InvalidMediaError, processVideo } from "@/features/worksite-media/server/process-media";

// The production image installs ffmpeg (Dockerfile); a machine without it skips these.
const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const dir = mkdtempSync(join(tmpdir(), "aluvia-video-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A generated clip carrying a phone-style location tag (invented coordinates). */
function clip(seconds: number): Buffer {
  const path = join(dir, `clip-${seconds}.mp4`);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=160x120:rate=10:duration=${seconds}`,
    "-c:v",
    "mpeg4",
    "-metadata",
    "location=-33.4000-070.5000/",
    "-metadata",
    "title=Clip inventado",
    "-movflags",
    "+use_metadata_tags",
    path,
  ]);
  return readFileSync(path);
}

/** The container's tags as ffprobe reads them. */
function formatTags(data: Buffer): Record<string, string> {
  const path = join(dir, "probe.mp4");
  writeFileSync(path, data);
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "json", path]);
  return (JSON.parse(out.toString()) as { format?: { tags?: Record<string, string> } }).format?.tags ?? {};
}

describe.skipIf(!hasFfmpeg)("processVideo", () => {
  it("drops the location and other metadata and keeps the length", async () => {
    const original = clip(2);
    expect(formatTags(original)).toMatchObject({ location: "-33.4000-070.5000/", title: "Clip inventado" });
    const processed = await processVideo(original, "video/mp4");
    expect(processed).toMatchObject({ contentType: "video/mp4", extension: "mp4" });
    expect(processed.durationSeconds).toBeCloseTo(2, 0);
    const tags = formatTags(processed.data);
    expect(tags.location).toBeUndefined();
    expect(tags.title).toBeUndefined();
    expect(processed.data.includes(Buffer.from("-33.4000"))).toBe(false);
  });

  it("refuses a clip longer than 30 seconds and a file that is not a video", async () => {
    await expect(processVideo(clip(32), "video/mp4")).rejects.toBeInstanceOf(InvalidMediaError);
    await expect(processVideo(Buffer.from("not a video"), "video/mp4")).rejects.toBeInstanceOf(
      InvalidMediaError,
    );
  });
});
