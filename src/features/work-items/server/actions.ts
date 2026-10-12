"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { trackServerEvent } from "@/shared/analytics/server";
import { hitFieldWriteLimit, resolveActorKeys, scheduleRateLimitPurge } from "@/shared/anonymous-actor";
import { canClaimWorkItems, getCurrentUser, getEmergencyAccess, isCoordinator } from "@/shared/auth";
import { db } from "@/shared/db/client";

import {
  type ClaimFailure,
  claimWorksiteSchema,
  type MarkStatusFailure,
  markWorkItemStatusSchema,
  type OwnClaimFailure,
  revertWorkItemStatusSchema,
  verifyWorkItemSchema,
  worksiteClaimSchema,
} from "../schemas";
import { claimWorkItem, markWorkItemArrived, releaseWorkItem, renewWorkItemClaim } from "./claims";
import { workItemActions } from "./metrics";
import { markWorkItemStatus, type RevertFailure, revertWorkItemStatus, verifyWorkItem } from "./status";

/**
 * The volunteer's buttons (issues #12, #13). Each parses at the border, checks the session and
 * membership through @/shared/auth, lets the database decide, then records the outcome. Answers
 * are codes the client translates (`errors.<code>`), never sentences.
 */

type SessionFailure = "invalid_input" | "unauthenticated" | "not_member" | "rate_limited";
type ActionResult<Code extends string> = { ok: true } | { ok: false; code: Code | SessionFailure };

/** Parses the input and resolves who is acting, or the code that stops them. */
async function authorize<S extends z.ZodType<{ emergencyId: string }>>(schema: S, input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthenticated" } as const;
  const access = await getEmergencyAccess(parsed.data.emergencyId);
  if (!access || !canClaimWorkItems(access)) return { ok: false, code: "not_member" } as const;
  return { ok: true, input: parsed.data as z.infer<S>, userId: user.id } as const;
}

function settle<Code extends string>(action: string, result: { ok: true } | { ok: false; code: Code }) {
  workItemActions.add(1, { action, outcome: result.ok ? "ok" : result.code });
  if (result.ok) refresh();
  return result.ok ? ({ ok: true } as const) : ({ ok: false, code: result.code } as const);
}

/** "Voy para allá" for a home: takes every free job of it at once. */
export async function claimWorksiteAction(input: unknown): Promise<ActionResult<ClaimFailure>> {
  const auth = await authorize(claimWorksiteSchema, input);
  if (!auth.ok) return settle("claim", auth);
  const { emergencyId, worksiteId } = auth.input;
  const result = await claimWorkItem(db, { emergencyId, worksiteId, userId: auth.userId });
  if (result.ok) {
    for (const workTypeKey of result.data.workTypeKeys) {
      trackServerEvent("work_item_claimed", { emergencyId, workTypeKey }, { distinctId: auth.userId });
    }
  } else if (result.code !== "not_found") {
    trackServerEvent(
      "work_item_claim_rejected",
      { emergencyId, code: result.code },
      { distinctId: auth.userId },
    );
  }
  return settle("claim", result);
}

export async function renewWorksiteClaimAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(worksiteClaimSchema, input);
  if (!auth.ok) return settle("renew", auth);
  const { emergencyId, worksiteId } = auth.input;
  const result = await renewWorkItemClaim(db, { emergencyId, worksiteId, userId: auth.userId });
  if (result.ok) trackServerEvent("work_item_claim_renewed", { emergencyId }, { distinctId: auth.userId });
  return settle("renew", result);
}

export async function markWorksiteArrivedAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(worksiteClaimSchema, input);
  if (!auth.ok) return settle("arrive", auth);
  const { emergencyId, worksiteId } = auth.input;
  const result = await markWorkItemArrived(db, { emergencyId, worksiteId, userId: auth.userId });
  if (result.ok) {
    for (const workTypeKey of result.data.workTypeKeys) {
      trackServerEvent("work_item_arrived", { emergencyId, workTypeKey }, { distinctId: auth.userId });
    }
  }
  return settle("arrive", result);
}

export async function releaseWorksiteAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(worksiteClaimSchema, input);
  if (!auth.ok) return settle("release", auth);
  const { emergencyId, worksiteId } = auth.input;
  const result = await releaseWorkItem(db, { emergencyId, worksiteId, userId: auth.userId });
  if (result.ok) trackServerEvent("work_item_released", { emergencyId }, { distinctId: auth.userId });
  return settle("release", result);
}

/**
 * Open to anyone, with or without an account (ADR 0018): no membership check, but a rate limit per
 * IP and device for everyone except coordinators, and the device and network keys on the event.
 */
export async function markWorkItemStatusAction(input: unknown): Promise<ActionResult<MarkStatusFailure>> {
  const parsed = markWorkItemStatusSchema.safeParse(input);
  if (!parsed.success) return settle("mark_status", { ok: false, code: "invalid_input" });
  const { emergencyId, items, status } = parsed.data;
  const user = await getCurrentUser();
  const [access, actor] = await Promise.all([
    user ? getEmergencyAccess(emergencyId) : null,
    resolveActorKeys(),
  ]);
  if (!isCoordinator(access)) {
    scheduleRateLimitPurge(db);
    if (!(await hitFieldWriteLimit(db, actor)))
      return settle("mark_status", { ok: false, code: "rate_limited" });
  }
  // A signed-in person who has not joined acts like anyone else: named only as a member.
  const userId = access?.role ? access.userId : null;
  const result = await markWorkItemStatus(db, { emergencyId, items, status, userId, actor });
  if (result.ok) {
    for (const workTypeKey of result.data.workTypeKeys) {
      trackServerEvent(
        "work_item_status_marked",
        {
          emergencyId,
          workTypeKey,
          status,
          isCoordinator: result.data.isCoordinator,
          isAnonymous: userId === null,
        },
        userId ? { distinctId: userId } : {},
      );
    }
  }
  return settle("mark_status", result);
}

/** A coordinator undoes a job's last status change (ADR 0018); the statement re-checks the role. */
export async function revertWorkItemStatusAction(input: unknown): Promise<ActionResult<RevertFailure>> {
  const auth = await authorize(revertWorkItemStatusSchema, input);
  if (!auth.ok) return settle("revert_status", auth);
  const { emergencyId, workItemId, version } = auth.input;
  const result = await revertWorkItemStatus(db, { emergencyId, workItemId, version, userId: auth.userId });
  if (result.ok) trackServerEvent("work_item_status_reverted", { emergencyId }, { distinctId: auth.userId });
  return settle("revert_status", result);
}

export async function verifyWorkItemAction(input: unknown): Promise<ActionResult<MarkStatusFailure>> {
  const auth = await authorize(verifyWorkItemSchema, input);
  if (!auth.ok) return settle("verify", auth);
  const { emergencyId, workItemId, version } = auth.input;
  const result = await verifyWorkItem(db, {
    emergencyId,
    workItemId,
    version,
    userId: auth.userId,
  });
  if (result.ok) trackServerEvent("work_item_verified", { emergencyId }, { distinctId: auth.userId });
  return settle("verify", result);
}
