"use server";

import { refresh } from "next/cache";

import { trackServerEvent } from "@/shared/analytics/server";
import { getCurrentUser, getEmergencyAccess, isMember } from "@/shared/auth";
import { db } from "@/shared/db/client";
import { meter } from "@/shared/observability/metrics";

import { type CancelFailure, shiftSignupSchema, type SignUpFailure } from "../schemas";
import { cancelShiftSignup, signUpForShift } from "./signups";

type SessionFailure = "invalid_input" | "unauthenticated" | "not_member";
type ActionResult<Code extends string> = { ok: true } | { ok: false; code: Code | SessionFailure };

// Labels: action and outcome code only. Many shift_full answers mean shifts need more seats.
const shiftActions = meter.createCounter("aluvia.shifts.actions", {
  description: "Shift sign-ups and cancellations by action and outcome code",
});

async function authorize(input: unknown) {
  const parsed = shiftSignupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const user = await getCurrentUser();
  if (!user) return { ok: false, code: "unauthenticated" } as const;
  const access = await getEmergencyAccess(parsed.data.emergencyId);
  if (!access || !isMember(access)) return { ok: false, code: "not_member" } as const;
  return { ok: true, input: parsed.data, userId: user.id } as const;
}

function settle<Code extends string>(action: string, result: { ok: true } | { ok: false; code: Code }) {
  shiftActions.add(1, { action, outcome: result.ok ? "ok" : result.code });
  if (result.ok) refresh();
  return result;
}

export async function signUpForShiftAction(input: unknown): Promise<ActionResult<SignUpFailure>> {
  const auth = await authorize(input);
  if (!auth.ok) return settle("sign_up", auth);
  const { emergencyId, shiftId } = auth.input;
  const result = await signUpForShift(db, { emergencyId, shiftId, userId: auth.userId });
  if (result.ok) trackServerEvent("shift_signed_up", { emergencyId }, { distinctId: auth.userId });
  else if (result.code !== "not_found") {
    trackServerEvent(
      "shift_signup_rejected",
      { emergencyId, code: result.code },
      { distinctId: auth.userId },
    );
  }
  return settle("sign_up", result);
}

export async function cancelShiftSignupAction(input: unknown): Promise<ActionResult<CancelFailure>> {
  const auth = await authorize(input);
  if (!auth.ok) return settle("cancel", auth);
  const { emergencyId, shiftId } = auth.input;
  const result = await cancelShiftSignup(db, { emergencyId, shiftId, userId: auth.userId });
  if (result.ok) trackServerEvent("shift_signup_cancelled", { emergencyId }, { distinctId: auth.userId });
  return settle("cancel", result);
}
