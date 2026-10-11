/**
 * Files waiting in the outbox (photos, videos), kept in IndexedDB: localStorage holds only a few
 * MB of text. Keyed by the outbox entry's id, deleted when the entry is. Without IndexedDB
 * (private mode in some browsers) files live in this tab's memory and are lost with it; the
 * outbox entry then ends as `media_lost` instead of waiting forever.
 */

const DB_NAME = "aluvia-outbox";
const STORE = "blobs";

const memory = new Map<string, Blob>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open().then(
    (database) =>
      new Promise((resolve) => {
        if (!database) {
          resolve(null);
          return;
        }
        const request = action(database.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      }),
  );
}

export async function saveBlob(id: string, blob: Blob): Promise<void> {
  memory.set(id, blob);
  const saved = await run("readwrite", (store) => store.put(blob, id));
  // Stored on disk: the tab's copy is no longer needed.
  if (saved !== null) memory.delete(id);
}

export async function loadBlob(id: string): Promise<Blob | null> {
  const stored = await run("readonly", (store) => store.get(id) as IDBRequest<Blob | undefined>);
  return stored ?? memory.get(id) ?? null;
}

export async function deleteBlob(id: string): Promise<void> {
  memory.delete(id);
  await run("readwrite", (store) => store.delete(id));
}
