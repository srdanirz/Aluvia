import { loadBlob } from "./blob-store";
import { type DeliveryResult, readAnswer } from "./read-answer";

/**
 * Sends one queued photo or video (ADR 0020), in three steps that are each safe to repeat:
 * 1. POST the entry's body: the server reserves the slot and answers a signed upload URL, or
 *    `ready` when an earlier round already finished;
 * 2. PUT the file to the bucket with the signed headers;
 * 3. POST `/api/v1/media/<id>/complete`: the server re-encodes and publishes it.
 * Any step without signal leaves the entry queued; the next round starts again at step 1, which
 * signs a fresh URL. `upload_missing` (the PUT never landed) is also a retry.
 */
export async function sendMediaEntry(entry: {
  id: string;
  url: string;
  body: unknown;
}): Promise<DeliveryResult> {
  const blob = await loadBlob(entry.id);
  if (!blob) return { status: "rejected", code: "media_lost" };

  const reserved = await post(entry.url, entry.body);
  if (reserved.status !== "sent") return reserved;
  const answer = reserved.response as {
    status?: string;
    uploadUrl?: string;
    uploadHeaders?: Record<string, string>;
  };
  if (answer.status === "ready") return reserved;
  if (typeof answer.uploadUrl !== "string" || !answer.uploadHeaders) return { status: "queued" };

  try {
    const put = await fetch(answer.uploadUrl, { method: "PUT", headers: answer.uploadHeaders, body: blob });
    // An expired or refused signature: the next round asks for a new one.
    if (!put.ok) return { status: "queued" };
  } catch {
    return { status: "queued" };
  }

  const completed = await post(`/api/v1/media/${entry.id}/complete`, {});
  if (completed.status === "rejected" && completed.code === "upload_missing") return { status: "queued" };
  return completed;
}

async function post(url: string, body: unknown): Promise<DeliveryResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return await readAnswer(response);
  } catch {
    return { status: "queued" };
  }
}
