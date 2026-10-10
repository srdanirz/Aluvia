import "server-only";

import { getLocale } from "next-intl/server";

import { getCurrentUser } from "@/shared/auth";
import { redirect } from "@/shared/i18n/navigation";
import { safePathSchema } from "@/shared/lib/safe-path";

import type { LoginState } from "../schemas";

/**
 * Where the login form starts. Someone already signed in goes straight back; someone signed in
 * without a name lands on the name step, without paying for another code.
 */
export async function loadLoginView(next: unknown): Promise<{ nextPath: string; initialState: LoginState }> {
  const nextPath = safePathSchema.parse(next);
  const user = await getCurrentUser();
  if (user?.name) redirect({ href: nextPath, locale: await getLocale() });
  return { nextPath, initialState: user ? { step: "name" } : { step: "phone" } };
}
