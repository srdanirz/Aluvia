import { z } from "zod";

export const shiftSignupSchema = z.strictObject({ emergencyId: z.uuid(), shiftId: z.uuid() });

export type SignUpFailure =
  "not_found" | "emergency_closed" | "not_member" | "shift_started" | "already_signed_up" | "shift_full";
export type CancelFailure = "not_signed_up";

export const shiftsQuerySchema = z.object({ cursor: z.string().max(200).optional().catch(undefined) });
