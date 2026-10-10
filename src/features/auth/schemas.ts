import { z } from "zod";

export const phoneFormSchema = z.object({ phone: z.string().trim().min(1).max(32) });

export const codeFormSchema = z.object({
  // People paste "123 456" from WhatsApp; spaces do not count.
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ""))
    .pipe(z.string().regex(/^[0-9]{6}$/)),
});

export const nameFormSchema = z.object({ name: z.string().trim().min(1).max(80) });

export type LoginErrorCode =
  | "invalid_phone"
  | "invalid_code"
  | "invalid_name"
  | "rate_limited"
  | "code_not_sent"
  | "code_expired"
  | "too_many_attempts";

/** The login is one form that walks phone, code and (first time only) name. */
export type LoginState =
  | { step: "phone"; phoneInput?: string; error?: LoginErrorCode }
  | { step: "code"; phone: string; error?: LoginErrorCode; resent?: boolean }
  | { step: "name"; error?: LoginErrorCode };
