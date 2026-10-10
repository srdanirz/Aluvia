"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { trackServerEvent } from "@/shared/analytics/server";
import { getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { env } from "@/shared/env";
import { LOCALES } from "@/shared/i18n/locales";
import { logError } from "@/shared/observability/logger";
import { hitRateLimit } from "@/shared/rate-limit";

import { pointSchema, worksiteReportSchema } from "../schemas";
import { createWorksites } from "./create-worksites";
import {
  type ExtractDraftsResult,
  extractWorksiteDrafts,
  MAX_BATCH_TEXT,
  MAX_DRAFTS,
} from "./extract-drafts";
import { extractDuration, reportsCounter } from "./metrics";
import { placeWorksite, type PlaceWorksiteResult } from "./place-worksite";
import { canImportWorksites, canPlaceWorksite, canReviewWorksite } from "./policy";
import { findOpenEmergencyId, findReportForm } from "./queries";
import { listWorksitesToReview, type ReviewPage } from "./review-queue";
import { markWorksiteHazardsReviewed, resolveWorksiteReviewFlag, type ReviewResult } from "./review-worksite";
import { worksiteReviewFlag } from "@/shared/db/schema/enums";

/**
 * Coordinator actions on homes. Every export here is callable from the browser, so each one
 * parses its input and checks the policy itself; trusted values (source, emergency) are derived
 * on the server, never taken from the input.
 */

type Denied = { ok: false; code: "invalid_input" | "emergency_not_found" | "forbidden" };

// A coordinator pasting story after story in a busy hour stays far below this.
const EXTRACTIONS_PER_HOUR = 60;

const extractInputSchema = z.object({
  slug: z.string().min(1).max(100),
  locale: z.enum(LOCALES),
  text: z.string().trim().min(1).max(MAX_BATCH_TEXT),
});

/** Batch import, step 1: turns a pasted post into drafts. Writes nothing; the text is not kept. */
export async function extractDrafts(
  input: z.input<typeof extractInputSchema>,
): Promise<ExtractDraftsResult | Denied | { ok: false; code: "extraction_unavailable" | "rate_limited" }> {
  const parsed = extractInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const form = await findReportForm({ slug: parsed.data.slug, locale: parsed.data.locale });
  if (!form) return { ok: false, code: "emergency_not_found" };
  const access = await getEmergencyAccess(form.emergency.id);
  if (!canImportWorksites(access)) return { ok: false, code: "forbidden" };
  if (!env.ANTHROPIC_API_KEY) return { ok: false, code: "extraction_unavailable" };
  // Each paste is a paid model call: a stolen or careless coordinator session cannot run it unbounded.
  const allowed = await hitRateLimit(db, {
    key: `worksite_extract:${access?.userId ?? "none"}`,
    limit: EXTRACTIONS_PER_HOUR,
    windowSeconds: 3600,
  });
  if (!allowed) return { ok: false, code: "rate_limited" };

  const started = performance.now();
  try {
    const result = await extractWorksiteDrafts(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }), {
      text: parsed.data.text,
      workTypes: form.workTypes,
    });
    extractDuration.record((performance.now() - started) / 1000, { outcome: result.ok ? "ok" : result.code });
    if (result.ok) {
      trackServerEvent(
        "worksite_drafts_extracted",
        { count: result.drafts.length },
        { distinctId: access?.userId },
      );
    }
    return result;
  } catch (error) {
    extractDuration.record((performance.now() - started) / 1000, { outcome: "extraction_failed" });
    // Never the pasted text: it may carry names and phones of people who did not consent.
    logError("anthropic_request_failed", error, {
      status: error instanceof Anthropic.APIError ? error.status : undefined,
    });
    return { ok: false, code: "extraction_failed" };
  }
}

const importInputSchema = z.object({
  slug: z.string().min(1).max(100),
  reports: z.array(worksiteReportSchema).min(1).max(MAX_DRAFTS),
});

/**
 * Batch import, step 2: creates the drafts the coordinator kept, as social-media reports without
 * a pin, unverified and without resident notices (no consent). Idempotent by each draft's id.
 */
export async function importWorksites(
  input: z.input<typeof importInputSchema>,
): Promise<{ ok: true; created: number } | Denied | { ok: false; code: "invalid_work_type" }> {
  const parsed = importInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const emergencyId = await findOpenEmergencyId(parsed.data.slug);
  if (!emergencyId) return { ok: false, code: "emergency_not_found" };
  const access = await getEmergencyAccess(emergencyId);
  if (!canImportWorksites(access)) return { ok: false, code: "forbidden" };

  // Residents never consented to a post being forwarded: nothing beyond the written address.
  const reports = parsed.data.reports.map((report) => ({
    ...report,
    contact: { ...report.contact, name: null, phone: null, notes: null, notifyChannel: null },
  }));
  const result = await createWorksites(db, { emergencyId, source: "social", reports });
  if (!result.ok) {
    reportsCounter.add(reports.length, { source: "social", outcome: "rejected" });
    return result;
  }
  reportsCounter.add(result.created.length, { source: "social", outcome: "created" });
  return { ok: true, created: result.created.length };
}

const placeInputSchema = z.object({
  slug: z.string().min(1).max(100),
  worksiteId: z.uuid(),
  location: pointSchema,
  version: z.number().int().min(0),
  allowNearby: z.boolean().default(false),
});

/** Puts or moves a home's pin, warning about a possible duplicate first (see placeWorksite). */
export async function placeWorksiteAction(
  input: z.input<typeof placeInputSchema>,
): Promise<PlaceWorksiteResult | Denied> {
  const parsed = placeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const emergencyId = await findOpenEmergencyId(parsed.data.slug);
  if (!emergencyId) return { ok: false, code: "emergency_not_found" };
  const access = await getEmergencyAccess(emergencyId);
  if (!canPlaceWorksite(access)) return { ok: false, code: "forbidden" };

  const { worksiteId, location, version, allowNearby } = parsed.data;
  const result = await placeWorksite(db, { emergencyId, worksiteId, location, version, allowNearby });
  if (result.ok) {
    trackServerEvent("worksite_placed", { hadNearby: allowNearby }, { distinctId: access?.userId });
  }
  return result;
}

const reviewInputSchema = z.object({
  slug: z.string().min(1).max(100),
  worksiteId: z.uuid(),
  version: z.number().int().min(0),
});

/** A coordinator settles one review flag (outside the area, possible duplicate, person in danger). */
export async function resolveReviewFlag(
  input: z.input<typeof reviewInputSchema> & { flag: string },
): Promise<ReviewResult | Denied> {
  const parsed = reviewInputSchema.extend({ flag: z.enum(worksiteReviewFlag.enumValues) }).safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const emergencyId = await findOpenEmergencyId(parsed.data.slug);
  if (!emergencyId) return { ok: false, code: "emergency_not_found" };
  if (!canReviewWorksite(await getEmergencyAccess(emergencyId))) return { ok: false, code: "forbidden" };
  const { worksiteId, version, flag } = parsed.data;
  return resolveWorksiteReviewFlag(db, { emergencyId, worksiteId, version, flag });
}

/** A coordinator checked the "do not enter" hazards; the home's work can be claimed again. */
export async function reviewHazards(
  input: z.input<typeof reviewInputSchema>,
): Promise<ReviewResult | Denied> {
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const emergencyId = await findOpenEmergencyId(parsed.data.slug);
  if (!emergencyId) return { ok: false, code: "emergency_not_found" };
  const access = await getEmergencyAccess(emergencyId);
  if (!access || !canReviewWorksite(access)) return { ok: false, code: "forbidden" };
  const { worksiteId, version } = parsed.data;
  return markWorksiteHazardsReviewed(db, { emergencyId, worksiteId, version, reviewedBy: access.userId });
}

const queueInputSchema = z.object({
  slug: z.string().min(1).max(100),
  cursor: z.string().max(200).nullable(),
});

/** Next page of the review queue; each page shown is a logged contact view. */
export async function loadReviewQueue(
  input: z.input<typeof queueInputSchema>,
): Promise<{ ok: true; page: ReviewPage } | Denied> {
  const parsed = queueInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" };
  const emergencyId = await findOpenEmergencyId(parsed.data.slug);
  if (!emergencyId) return { ok: false, code: "emergency_not_found" };
  const access = await getEmergencyAccess(emergencyId);
  if (!access || !canReviewWorksite(access)) return { ok: false, code: "forbidden" };
  const page = await listWorksitesToReview(db, {
    emergencyId,
    viewerId: access.userId,
    cursor: parsed.data.cursor,
  });
  return { ok: true, page };
}
