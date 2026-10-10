"use server";

import { getLocale } from "next-intl/server";
import { headers } from "next/headers";

import { getCurrentUser } from "@/shared/auth";
import { normalizePhone } from "@/shared/auth/phone";
import { deleteSession } from "@/shared/auth/session";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/shared/auth/session-cookie";
import { db } from "@/shared/db/client";
import { env } from "@/shared/env";
import { redirect } from "@/shared/i18n/navigation";
import { safePathSchema } from "@/shared/lib/safe-path";
import { clientIpKey } from "@/shared/rate-limit";

import { codeFormSchema, type LoginState, nameFormSchema, phoneFormSchema } from "../schemas";
import { requestLoginCode, updateUserName, verifyLoginCode } from "./login";

// TODO(#23): emit login_code_requested / login_code_verified / login_code_failed and the
// aluvia.auth.login_code.sent counter once the analytics catalog is on main.

/** One step of the login form. The state machine lives here, so the client only renders it. */
export async function submitLogin(
  nextPath: string,
  state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const locale = await getLocale();
  const next = safePathSchema.parse(nextPath);
  const ipKey = clientIpKey(await headers(), {
    secret: env.RATE_LIMIT_SECRET,
    trustedProxyHops: env.TRUSTED_PROXY_HOPS,
  });

  if (state.step === "phone") {
    const input = phoneFormSchema.safeParse(Object.fromEntries(formData));
    const phone = input.success ? normalizePhone(input.data.phone) : null;
    const phoneInput = String(formData.get("phone") ?? "");
    if (!phone) return { step: "phone", phoneInput, error: "invalid_phone" };
    const sent = await requestLoginCode(db, { phone, ipKey, locale });
    return sent.ok ? { step: "code", phone } : { step: "phone", phoneInput, error: sent.code };
  }

  if (state.step === "code") {
    if (formData.get("intent") === "change") return { step: "phone" };
    // The state comes back from the client: the phone is re-checked against the allowed
    // countries, or a forged state could send paid codes to any number in the world.
    const phone = normalizePhone(state.phone);
    if (!phone) return { step: "phone", error: "invalid_phone" };
    if (formData.get("intent") === "resend") {
      const sent = await requestLoginCode(db, { phone, ipKey, locale });
      return sent.ok ? { step: "code", phone, resent: true } : { step: "code", phone, error: sent.code };
    }
    const input = codeFormSchema.safeParse(Object.fromEntries(formData));
    if (!input.success) return { step: "code", phone, error: "invalid_code" };
    const result = await verifyLoginCode(db, { phone, code: input.data.code, ipKey });
    if (!result.ok) return { step: "code", phone, error: result.code };
    await setSessionCookie(result.token);
    if (!result.hasName) return { step: "name" };
    return redirect({ href: next, locale });
  }

  const user = await getCurrentUser();
  if (!user) return { step: "phone" };
  const input = nameFormSchema.safeParse(Object.fromEntries(formData));
  if (!input.success) return { step: "name", error: "invalid_name" };
  await updateUserName(db, { userId: user.id, name: input.data.name });
  return redirect({ href: next, locale });
}

export async function logOut(): Promise<void> {
  const token = await readSessionToken();
  if (token) await deleteSession(db, token);
  await clearSessionCookie();
  redirect({ href: "/", locale: await getLocale() });
}
