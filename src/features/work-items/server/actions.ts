"use server";

import { refresh } from "next/cache";
import type { z } from "zod";

import { trackServerEvent } from "@/shared/analytics/server";
import { canClaimWorkItems, getCurrentUser, getEmergencyAccess } from "@/shared/auth";
import { db } from "@/shared/db/client";

import {
  type ClaimFailure,
  claimWorkItemSchema,
  type MarkStatusFailure,
  markWorkItemStatusSchema,
  type OwnClaimFailure,
  verifyWorkItemSchema,
  workItemClaimSchema,
} from "../schemas";
import { claimWorkItem, markWorkItemArrived, releaseWorkItem, renewWorkItemClaim } from "./claims";
import { workItemActions } from "./metrics";
import { markWorkItemStatus, verifyWorkItem } from "./status";

/**
 * The volunteer's buttons (issues #12, #13). Each parses at the border, checks the session and
 * membership through @/shared/auth, lets the database decide, then records the outcome. Answers
 * are codes the client translates (`errors.<code>`), never sentences.
 */

type SessionFailure = "invalid_input" | "unauthenticated" | "not_member";
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

export async function claimWorkItemAction(input: unknown): Promise<ActionResult<ClaimFailure>> {
  const auth = await authorize(claimWorkItemSchema, input);
  if (!auth.ok) return settle("claim", auth);
  const { emergencyId, workItemId } = auth.input;
  const result = await claimWorkItem(db, { emergencyId, workItemId, userId: auth.userId });
  if (result.ok) {
    trackServerEvent(
      "work_item_claimed",
      { emergencyId, workTypeKey: result.data.workTypeKey },
      { distinctId: auth.userId },
    );
  } else if (result.code !== "not_found") {
    trackServerEvent(
      "work_item_claim_rejected",
      { emergencyId, code: result.code },
      { distinctId: auth.userId },
    );
  }
  return settle("claim", result);
}

export async function renewWorkItemClaimAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(workItemClaimSchema, input);
  if (!auth.ok) return settle("renew", auth);
  const { emergencyId, workItemId } = auth.input;
  const result = await renewWorkItemClaim(db, {
    emergencyId,
    workItemId,
    userId: auth.userId,
  });
  if (result.ok) trackServerEvent("work_item_claim_renewed", { emergencyId }, { distinctId: auth.userId });
  return settle("renew", result);
}

export async function markWorkItemArrivedAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(workItemClaimSchema, input);
  if (!auth.ok) return settle("arrive", auth);
  const { emergencyId, workItemId } = auth.input;
  const result = await markWorkItemArrived(db, {
    emergencyId,
    workItemId,
    userId: auth.userId,
  });
  if (result.ok) {
    trackServerEvent(
      "work_item_arrived",
      { emergencyId, workTypeKey: result.data.workTypeKey },
      { distinctId: auth.userId },
    );
  }
  return settle("arrive", result);
}

export async function releaseWorkItemAction(input: unknown): Promise<ActionResult<OwnClaimFailure>> {
  const auth = await authorize(workItemClaimSchema, input);
  if (!auth.ok) return settle("release", auth);
  const { emergencyId, workItemId } = auth.input;
  const result = await releaseWorkItem(db, { emergencyId, workItemId, userId: auth.userId });
  if (result.ok) trackServerEvent("work_item_released", { emergencyId }, { distinctId: auth.userId });
  return settle("release", result);
}

export async function markWorkItemStatusAction(input: unknown): Promise<ActionResult<MarkStatusFailure>> {
  const auth = await authorize(markWorkItemStatusSchema, input);
  if (!auth.ok) return settle("mark_status", auth);
  const { emergencyId, workItemId, status, version } = auth.input;
  const result = await markWorkItemStatus(db, {
    emergencyId,
    workItemId,
    status,
    version,
    userId: auth.userId,
  });
  if (result.ok) {
    trackServerEvent(
      "work_item_status_marked",
      { emergencyId, workTypeKey: result.data.workTypeKey, status, isCoordinator: result.data.isCoordinator },
      { distinctId: auth.userId },
    );
  }
  return settle("mark_status", result);
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
