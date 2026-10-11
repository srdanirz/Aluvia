import { MediaNotFoundError, type MediaStore, MediaTooLargeError } from "@/shared/storage/media-store";

/** A bucket in memory: what the browser PUT (`objects`), what the app wrote and deleted. */
export function createMemoryMediaStore() {
  const objects = new Map<string, { data: Buffer; contentType: string }>();
  const removed: string[] = [];
  const failing = new Set<string>();
  const store: MediaStore = {
    async signUpload(key, { contentType, maxBytes }) {
      return {
        url: `https://storage.test/${key}?signed=upload`,
        headers: { "content-type": contentType, "x-goog-content-length-range": `1,${maxBytes}` },
      };
    },
    async signRead(key) {
      return `https://storage.test/${key}?signed=read`;
    },
    async read(key, maxBytes) {
      const object = objects.get(key);
      if (!object) throw new MediaNotFoundError(key);
      if (object.data.length > maxBytes) throw new MediaTooLargeError(key);
      return object.data;
    },
    async write(key, data, contentType) {
      objects.set(key, { data, contentType });
    },
    async remove(key) {
      if (failing.has(key)) throw new Error("bucket unavailable");
      objects.delete(key);
      removed.push(key);
    },
  };
  return { store, objects, removed, failing };
}
