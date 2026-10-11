/**
 * Writes that must survive no signal, a closed tab and a deploy (DESIGN.md: input is never lost).
 * An entry is a JSON POST to a versioned /api/v1 route, keyed by the client-generated id of what
 * it creates, so sending it twice is safe. Entries stay in localStorage until the server answers
 * 2xx; a definitive 4xx moves them to `rejected` for the person to see, never to the bin.
 *
 * Server Actions are not used here on purpose: their ids change on every deploy, so a write
 * queued yesterday would hit a missing action today.
 */

import { deleteBlob } from "./blob-store";
import { sendMediaEntry } from "./media-delivery";
import { type DeliveryResult, readAnswer } from "./read-answer";

const STORAGE_KEY = "aluvia.outbox.v1";
const CHANGE_EVENT = "aluvia:outbox";

export type OutboxEntry = {
  id: string;
  /** What the entry creates, for the screens that list pending writes. */
  kind: "worksite" | "worksite_update" | "worksite_media";
  url: string;
  body: unknown;
  queuedAt: string;
  status: "pending" | "rejected";
  /** Server error code of a rejected entry, translated by the UI. */
  code?: string;
};

export type { DeliveryResult };

// The queue this tab works from when localStorage is blocked or full. It is lost with the tab,
// so the form still shows the entry as waiting and keeps it sending while the tab lives.
let memory: OutboxEntry[] | null = null;

function read(): OutboxEntry[] {
  if (memory) return memory;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    return JSON.parse(raw) as OutboxEntry[];
  } catch {
    // Keep the unreadable queue aside instead of overwriting it with the next write.
    try {
      window.localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, raw);
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage refuses even that: nothing more can be saved on this device.
    }
    return [];
  }
}

function write(entries: OutboxEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    memory = null;
  } catch {
    // Quota full or storage blocked: the write still goes out from memory.
    memory = entries.length > 0 ? entries : null;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function upsert(entry: OutboxEntry) {
  write([...read().filter((e) => e.id !== entry.id), entry]);
}

function remove(id: string) {
  write(read().filter((e) => e.id !== id));
}

export function listOutbox(): OutboxEntry[] {
  return read();
}

/** Subscribes to queue changes in this tab and in others; returns the unsubscribe. */
export function subscribeOutbox(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function discardOutboxEntry(id: string) {
  remove(id);
  void deleteBlob(id);
}

async function deliver(entry: OutboxEntry): Promise<DeliveryResult> {
  // A photo or video travels in three steps with its file from IndexedDB (media-delivery.ts).
  const result = entry.kind === "worksite_media" ? await sendMediaEntry(entry) : await sendJson(entry);
  if (result.status === "sent") {
    remove(entry.id);
    if (entry.kind === "worksite_media") await deleteBlob(entry.id);
  }
  if (result.status === "rejected") upsert({ ...entry, status: "rejected", code: result.code });
  return result;
}

async function sendJson(entry: OutboxEntry): Promise<DeliveryResult> {
  let response: Response;
  try {
    response = await fetch(entry.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry.body),
      keepalive: true,
    });
  } catch {
    // No network or the request died mid-way; the id makes the retry safe.
    return { status: "queued" };
  }
  return readAnswer(response);
}

/** Stores the write first, then tries to send it. Resolves once the outcome of this attempt is known. */
export function enqueue(entry: Omit<OutboxEntry, "queuedAt" | "status">): Promise<DeliveryResult> {
  const stored: OutboxEntry = { ...entry, queuedAt: new Date().toISOString(), status: "pending" };
  upsert(stored);
  return deliver(stored);
}

/**
 * Stores the write without sending it now; the next flush sends it after what is already queued.
 * For files: a report and its photos go out in the order they were queued, and the form does not
 * wait for a 50 MB upload.
 */
export function enqueueLater(entry: Omit<OutboxEntry, "queuedAt" | "status">): void {
  upsert({ ...entry, queuedAt: new Date().toISOString(), status: "pending" });
}

let flushing: Promise<void> | null = null;

// One at a time, so a weak connection is not split across many requests; the first send that
// fails stops the round, since the next ones would fail the same way.
async function sendInOrder(entries: readonly OutboxEntry[]): Promise<void> {
  const [first, ...rest] = entries;
  if (!first) return;
  const result = await deliver(first);
  if (result.status !== "queued") await sendInOrder(rest);
}

/** Sends every pending entry. Concurrent calls share the round in flight. */
export function flushOutbox(): Promise<void> {
  flushing ??= sendInOrder(read().filter((e) => e.status === "pending")).finally(() => {
    flushing = null;
  });
  return flushing;
}
