import "server-only";

import { Storage, type StorageOptions } from "@google-cloud/storage";

import { env } from "@/shared/env";

/**
 * The private media bucket (ADR 0020), behind the few operations the app needs, so tests swap in
 * an in-memory store. Nothing in the bucket is public: the browser uploads with a signed PUT and
 * reads with a signed GET, both short-lived. On Cloud Run there is no key file, so each signature
 * is an IAM signBlob call made as the app's service account (roles/iam.serviceAccountTokenCreator
 * on itself, infra/media.tf).
 */
export type MediaStore = {
  /** A URL the browser PUTs the object to, with the headers it must send unchanged. */
  signUpload(
    key: string,
    options: { contentType: string; maxBytes: number },
  ): Promise<{ url: string; headers: Record<string, string> }>;
  signRead(key: string): Promise<string>;
  /** The object's bytes; throws `MediaTooLargeError` past `maxBytes` and `MediaNotFoundError` if absent. */
  read(key: string, maxBytes: number): Promise<Buffer>;
  write(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Deletes the object; an absent one counts as deleted. */
  remove(key: string): Promise<void>;
};

export class MediaNotFoundError extends Error {}
export class MediaTooLargeError extends Error {}

// Long enough for a 50 MB video on a slow 3G link (~1 Mbit/s is ~7 min); short enough that a
// leaked link dies the same day.
export const UPLOAD_URL_SECONDS = 15 * 60;
export const READ_URL_SECONDS = 15 * 60;

/** The bucket-backed store. `options` only for tests, which sign with a throwaway key. */
export function createGcsMediaStore(bucketName: string, options?: StorageOptions): MediaStore {
  const bucket = new Storage(options).bucket(bucketName);
  return {
    async signUpload(key, { contentType, maxBytes }) {
      // The bucket enforces the size by this signed header: a bigger body is refused by GCS itself.
      const headers = { "x-goog-content-length-range": `1,${maxBytes}` };
      const [url] = await bucket.file(key).getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + UPLOAD_URL_SECONDS * 1000,
        contentType,
        extensionHeaders: headers,
      });
      return { url, headers: { ...headers, "content-type": contentType } };
    },
    async signRead(key) {
      const [url] = await bucket.file(key).getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + READ_URL_SECONDS * 1000,
      });
      return url;
    },
    async read(key, maxBytes) {
      const file = bucket.file(key);
      const [exists] = await file.exists();
      if (!exists) throw new MediaNotFoundError(key);
      const [metadata] = await file.getMetadata();
      if (Number(metadata.size) > maxBytes) throw new MediaTooLargeError(key);
      const [data] = await file.download();
      return data;
    },
    async write(key, data, contentType) {
      await bucket.file(key).save(data, { contentType, resumable: false });
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
  };
}

let store: MediaStore | null | undefined;

/** The configured store, or null when MEDIA_BUCKET is unset (dev, CI, a fork): media is off. */
export function getMediaStore(): MediaStore | null {
  store ??= env.MEDIA_BUCKET ? createGcsMediaStore(env.MEDIA_BUCKET) : null;
  return store;
}
