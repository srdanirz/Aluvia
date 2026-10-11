import { generateKeyPairSync, randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";

import { completeMediaUpload } from "@/features/worksite-media/server/complete-media-upload";
import { createMediaUpload } from "@/features/worksite-media/server/create-media-upload";
import { deleteQueuedMediaObjects } from "@/features/worksite-media/server/delete-queued-objects";
import { listWorksiteMedia } from "@/features/worksite-media/server/list-worksite-media";
import { setWorksiteMediaHidden } from "@/features/worksite-media/server/set-media-hidden";
import { MEDIA_LIMITS, type MediaUpload, mediaUploadSchema } from "@/features/worksite-media/schemas";
import { reportReceipts } from "@/shared/db/schema";
import { originalObjectKey } from "@/shared/storage/media-keys";
import { createGcsMediaStore } from "@/shared/storage/media-store";

import { createTestDb } from "../setup/db";
import { createMemoryMediaStore } from "../setup/media-store";
import { createEmergency, createUsers, createWorksite } from "../work-items/fixtures";

const { db, counter, close } = createTestDb();
afterAll(close);

const image = (overrides: Partial<MediaUpload> = {}): MediaUpload =>
  mediaUploadSchema.parse({
    id: randomUUID(),
    kind: "image",
    contentType: "image/jpeg",
    sizeBytes: 2000,
    ...overrides,
  });

async function home() {
  const emergency = await createEmergency(db);
  const { worksiteId } = await createWorksite(db, emergency.id);
  return { slug: emergency.slug, emergencyId: emergency.id, worksiteId };
}

/** A JPEG carrying EXIF with GPS and a camera model, like a phone photo. */
async function photoWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: "Telefono de prueba", Model: "Modelo inventado" },
      IFD3: {
        GPSLatitudeRef: "S",
        GPSLatitude: "33/1 24/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "70/1 30/1 0/1",
      },
    })
    .toBuffer();
}

describe("upload limits", () => {
  it("takes 5 photos and 1 video per home, decided by the database under concurrency", async () => {
    const { slug, worksiteId } = await home();
    const attempts = Array.from({ length: 8 }, () =>
      createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload: image() }),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r.ok)).toHaveLength(MEDIA_LIMITS.image.perHome);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.code)).toEqual(
      Array(3).fill("media_limit_reached"),
    );

    const video = () =>
      mediaUploadSchema.parse({
        id: randomUUID(),
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: 9000,
        durationSeconds: 29,
      });
    const videos = await Promise.all(
      [1, 2, 3].map(() =>
        createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload: video() }),
      ),
    );
    expect(videos.filter((r) => r.ok)).toHaveLength(1);
  });

  it("answers a retry with the same upload instead of spending a second slot", async () => {
    const { slug, worksiteId } = await home();
    const upload = image();
    const first = await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload });
    const again = await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload });
    expect(first).toMatchObject({ ok: true, status: "pending" });
    expect(again).toMatchObject({ ok: true, status: "pending", worksiteId });
    const [row] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM worksite_media WHERE worksite_id = ${worksiteId}`,
    );
    expect(row?.n).toBe(1);
  });

  it("follows a report's id to the home it ended on", async () => {
    const { slug, emergencyId, worksiteId } = await home();
    const reportId = randomUUID();
    await db.insert(reportReceipts).values({ id: reportId, emergencyId, worksiteId });
    const result = await createMediaUpload(db, { slug, target: reportId, uploadedBy: null, upload: image() });
    expect(result).toMatchObject({ ok: true, worksiteId });
  });

  it("refuses a home of another emergency, and types, sizes and lengths past the limits", async () => {
    const { worksiteId } = await home();
    const other = await createEmergency(db);
    const result = await createMediaUpload(db, {
      slug: other.slug,
      target: worksiteId,
      uploadedBy: null,
      upload: image(),
    });
    expect(result).toEqual({ ok: false, code: "worksite_not_found" });

    const base = { id: randomUUID(), sizeBytes: 1000 };
    expect(
      mediaUploadSchema.safeParse({ ...base, kind: "image", contentType: "image/svg+xml" }).success,
    ).toBe(false);
    expect(
      mediaUploadSchema.safeParse({
        ...base,
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: MEDIA_LIMITS.image.maxBytes + 1,
      }).success,
    ).toBe(false);
    expect(
      mediaUploadSchema.safeParse({ ...base, kind: "video", contentType: "video/mp4", durationSeconds: 31 })
        .success,
    ).toBe(false);
    expect(
      mediaUploadSchema.safeParse({ ...base, kind: "video", contentType: "video/mp4", durationSeconds: null })
        .success,
    ).toBe(false);
  });
});

describe("signing", () => {
  it("binds the upload URL to the type and the size limit, and expires it", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const store = createGcsMediaStore("bucket-de-prueba", {
      projectId: "proyecto-de-prueba",
      credentials: {
        client_email: "firma@proyecto-de-prueba.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      },
    });
    const { url, headers } = await store.signUpload("uploads/e/m", {
      contentType: "image/jpeg",
      maxBytes: 100,
    });
    const signed = new URL(url);
    expect(signed.pathname).toBe("/bucket-de-prueba/uploads/e/m");
    expect(signed.searchParams.get("X-Goog-Algorithm")).toBe("GOOG4-RSA-SHA256");
    expect(signed.searchParams.get("X-Goog-Expires")).toBe("900");
    expect(signed.searchParams.get("X-Goog-SignedHeaders")).toBe(
      "content-type;host;x-goog-content-length-range",
    );
    expect(headers).toEqual({ "content-type": "image/jpeg", "x-goog-content-length-range": "1,100" });

    const read = new URL(await store.signRead("media/e/m.webp"));
    expect(read.searchParams.get("X-Goog-Expires")).toBe("900");
    expect(read.searchParams.get("X-Goog-SignedHeaders")).toBe("host");
  });
});

describe("completing an upload", () => {
  it("re-encodes a photo without EXIF or GPS, publishes it and queues the original", async () => {
    const { slug, emergencyId, worksiteId } = await home();
    const { store, objects } = createMemoryMediaStore();
    const upload = image();
    await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload });
    const original = await photoWithGps();
    expect(original.includes(Buffer.from("Modelo inventado"))).toBe(true);
    await store.write(originalObjectKey(emergencyId, upload.id), original, "image/jpeg");

    expect(await completeMediaUpload(db, store, { mediaId: upload.id })).toMatchObject({
      ok: true,
      published: true,
    });
    const published = objects.get(`media/${emergencyId}/${upload.id}.webp`);
    expect(published?.contentType).toBe("image/webp");
    const metadata = await sharp(published!.data).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 1600, height: 1200 });
    expect(metadata.exif).toBeUndefined();
    expect(published!.data.includes(Buffer.from("Modelo inventado"))).toBe(false);

    // A retry answers ready and touches nothing.
    expect(await completeMediaUpload(db, store, { mediaId: upload.id })).toMatchObject({
      ok: true,
      published: false,
    });
    const queued = await db.execute<{ object_key: string }>(
      sql`SELECT object_key FROM media_object_deletions WHERE object_key = ${originalObjectKey(emergencyId, upload.id)}`,
    );
    expect(queued).toHaveLength(1);
  });

  it("refuses what does not decode and frees the slot; waits for an upload that has not landed", async () => {
    const { slug, emergencyId, worksiteId } = await home();
    const { store } = createMemoryMediaStore();
    const missing = image();
    await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload: missing });
    expect(await completeMediaUpload(db, store, { mediaId: missing.id })).toEqual({
      ok: false,
      code: "upload_missing",
    });

    const broken = image();
    await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload: broken });
    await store.write(originalObjectKey(emergencyId, broken.id), Buffer.from("not an image"), "image/jpeg");
    expect(await completeMediaUpload(db, store, { mediaId: broken.id })).toEqual({
      ok: false,
      code: "invalid_media",
    });
    const [row] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM worksite_media WHERE id = ${broken.id}`,
    );
    expect(row?.n).toBe(0);
  });
});

describe("gallery and hiding", () => {
  async function publishedPhotos(n: number) {
    const target = await home();
    const { store } = createMemoryMediaStore();
    const photo = await photoWithGps();
    const uploads = Array.from({ length: n }, () => image());
    // One after the other on purpose: created_at orders the gallery.
    await uploads.reduce(async (previous, upload) => {
      await previous;
      await createMediaUpload(db, { slug: target.slug, target: target.worksiteId, uploadedBy: null, upload });
      await store.write(originalObjectKey(target.emergencyId, upload.id), photo, "image/jpeg");
      await completeMediaUpload(db, store, { mediaId: upload.id });
    }, Promise.resolve());
    const ids = uploads.map((upload) => upload.id);
    return { ...target, store, ids };
  }

  it("lists a home's media in one query with signed URLs, whatever its size", async () => {
    const one = await publishedPhotos(1);
    const five = await publishedPhotos(5);
    counter.reset();
    const small = await listWorksiteMedia(
      { worksiteId: one.worksiteId, includeHidden: false },
      db,
      one.store,
    );
    const forOne = counter.count;
    counter.reset();
    const large = await listWorksiteMedia(
      { worksiteId: five.worksiteId, includeHidden: false },
      db,
      five.store,
    );
    expect(counter.count).toBe(forOne);
    expect(forOne).toBe(1);
    expect(small).toHaveLength(1);
    expect(large.map((item) => item.id)).toEqual(five.ids);
    expect(large[0]?.url).toMatch(/signed=read$/);
  });

  it("lets a coordinator hide an item from the public, which frees its slot; nobody else can", async () => {
    const target = await publishedPhotos(5);
    const [coordinator] = await createUsers(db, target.emergencyId, 1, "coordinator");
    const [volunteer] = await createUsers(db, target.emergencyId, 1, "volunteer");
    const hiddenId = target.ids[0]!;

    expect(await setWorksiteMediaHidden(db, volunteer!, { mediaId: hiddenId, hidden: true })).toEqual({
      ok: false,
      code: "media_not_found",
    });
    expect(await setWorksiteMediaHidden(db, coordinator!, { mediaId: hiddenId, hidden: true })).toEqual({
      ok: true,
    });

    const shown = await listWorksiteMedia(
      { worksiteId: target.worksiteId, includeHidden: false },
      db,
      target.store,
    );
    expect(shown.map((item) => item.id)).not.toContain(hiddenId);
    const forCoordinator = await listWorksiteMedia(
      { worksiteId: target.worksiteId, includeHidden: true },
      db,
      target.store,
    );
    expect(forCoordinator.find((item) => item.id === hiddenId)?.hidden).toBe(true);

    const sixth = await createMediaUpload(db, {
      slug: target.slug,
      target: target.worksiteId,
      uploadedBy: null,
      upload: image(),
    });
    expect(sixth.ok).toBe(true);
  });
});

describe("deleting queued objects", () => {
  it("deletes queued objects and abandoned uploads, and keeps what the bucket failed to delete", async () => {
    const { slug, emergencyId, worksiteId } = await home();
    const { store, removed, failing } = createMemoryMediaStore();
    const abandoned = image();
    await createMediaUpload(db, { slug, target: worksiteId, uploadedBy: null, upload: abandoned });
    await db.execute(
      sql`UPDATE worksite_media SET created_at = now() - interval '2 days' WHERE id = ${abandoned.id}`,
    );
    const stuck = `media/${emergencyId}/stuck.webp`;
    failing.add(stuck);
    await db.execute(
      sql`INSERT INTO media_object_deletions (object_key) VALUES (${stuck}), (${`media/${emergencyId}/gone.webp`})`,
    );

    await deleteQueuedMediaObjects(db, store);
    expect(removed).toEqual(
      expect.arrayContaining([
        originalObjectKey(emergencyId, abandoned.id),
        `media/${emergencyId}/gone.webp`,
      ]),
    );
    const left = await db.execute<{ object_key: string }>(
      sql`SELECT object_key FROM media_object_deletions WHERE object_key LIKE ${`%${emergencyId}%`}`,
    );
    expect(left.map((row) => row.object_key)).toEqual([stuck]);
    const [row] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM worksite_media WHERE id = ${abandoned.id}`,
    );
    expect(row?.n).toBe(0);
  });
});
