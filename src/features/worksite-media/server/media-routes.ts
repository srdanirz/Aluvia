import "server-only";

import { after } from "next/server";
import { z } from "zod";

import { trackServerEvent } from "@/shared/analytics/server";
import { getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { env } from "@/shared/env";
import { errorResponse, parseJsonBody } from "@/shared/http";
import { logError } from "@/shared/observability/logger";
import { clientIpKey, hitRateLimit, purgeStaleRateLimits } from "@/shared/rate-limit";
import { originalObjectKey } from "@/shared/storage/media-keys";
import { getMediaStore } from "@/shared/storage/media-store";

import { MEDIA_LIMITS, mediaUploadSchema } from "../schemas";
import { completeMediaUpload } from "./complete-media-upload";
import { createMediaUpload, creditMediaUploader } from "./create-media-upload";
import { mediaUploadsCounter } from "./metrics";

// A neighbor sends at most 6 items per home; this allows a few homes per network in the window
// and stops a script filling every gallery of an emergency.
const UPLOADS_PER_WINDOW = 30;
const WINDOW_SECONDS = 600;
const PURGE_EVERY = 100;

async function isRateLimited(request: Request, step: string): Promise<boolean> {
  const ipKey = clientIpKey(request.headers, {
    secret: env.RATE_LIMIT_SECRET,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });
  const allowed = await hitRateLimit(db, {
    key: `worksite_media_${step}:${ipKey}`,
    limit: UPLOADS_PER_WINDOW,
    windowSeconds: WINDOW_SECONDS,
  });
  if (Math.random() < 1 / PURGE_EVERY) after(() => purgeStaleRateLimits(db));
  return !allowed;
}

/**
 * POST /api/v1/emergencies/[slug]/worksites/[id]/media: reserves a slot for a photo or video and
 * answers where to PUT it (ADR 0020). No account needed, like reporting; rate limited per network.
 * `id` may be the home's or the report's that created it. Idempotent by the body's id: a retry
 * gets a fresh upload URL while pending, and `{ status: "ready" }` once published.
 */
export async function requestMediaUpload(request: Request, slug: string, target: string): Promise<Response> {
  const store = getMediaStore();
  if (!store) return errorResponse(503, "media_unavailable");
  if (!z.uuid().safeParse(target).success) return errorResponse(404, "worksite_not_found");
  if (await isRateLimited(request, "request")) {
    mediaUploadsCounter.add(1, { step: "requested", outcome: "rate_limited" });
    return errorResponse(429, "rate_limited");
  }
  const body = await parseJsonBody(request, mediaUploadSchema);
  if (!body.ok) {
    mediaUploadsCounter.add(1, { step: "requested", outcome: "rejected" });
    return body.response;
  }
  const upload = body.data;
  const result = await createMediaUpload(db, { slug, target, uploadedBy: null, upload });
  if (!result.ok) {
    mediaUploadsCounter.add(1, { step: "requested", kind: upload.kind, outcome: result.code });
    return errorResponse(result.code === "worksite_not_found" ? 404 : 409, result.code);
  }
  // Looked up only to credit a signed-in uploader; it never gates the upload.
  const access = await getEmergencyAccess(result.emergencyId);
  if (access && result.status === "pending") await creditMediaUploader(db, upload.id, access.userId);
  mediaUploadsCounter.add(1, { step: "requested", kind: upload.kind, outcome: result.status });
  if (result.status === "ready") return Response.json({ id: upload.id, status: "ready" });
  const signed = await store.signUpload(originalObjectKey(result.emergencyId, upload.id), {
    contentType: upload.contentType,
    maxBytes: MEDIA_LIMITS[upload.kind].maxBytes,
  });
  return Response.json(
    { id: upload.id, status: "pending", uploadUrl: signed.url, uploadHeaders: signed.headers },
    { status: 201 },
  );
}

/**
 * POST /api/v1/media/[id]/complete: the browser finished its PUT; the server re-encodes the
 * original and publishes it. `409 upload_missing` means the PUT never landed: the client asks for
 * a new upload URL and tries again.
 */
export async function completeMediaUploadRoute(request: Request, mediaId: string): Promise<Response> {
  const store = getMediaStore();
  if (!store) return errorResponse(503, "media_unavailable");
  if (!z.uuid().safeParse(mediaId).success) return errorResponse(404, "media_not_found");
  if (await isRateLimited(request, "complete")) {
    mediaUploadsCounter.add(1, { step: "completed", outcome: "rate_limited" });
    return errorResponse(429, "rate_limited");
  }
  try {
    const result = await completeMediaUpload(db, store, { mediaId });
    mediaUploadsCounter.add(1, { step: "completed", outcome: result.ok ? "ready" : result.code });
    if (!result.ok) {
      const status = result.code === "media_not_found" ? 404 : result.code === "upload_missing" ? 409 : 422;
      return errorResponse(status, result.code);
    }
    if (result.published) trackServerEvent("worksite_media_published", { kind: result.kind });
    return Response.json({ id: mediaId, status: "ready" });
  } catch (error) {
    mediaUploadsCounter.add(1, { step: "completed", outcome: "failed" });
    logError("media_complete_failed", error, { mediaId });
    return errorResponse(500, "unknown");
  }
}
