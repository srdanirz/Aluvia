import "server-only";

import { getLocale } from "next-intl/server";

import type { Locale } from "@/shared/i18n/locales";
import { redirect } from "@/shared/i18n/navigation";

import { getCurrentUser } from "./current-user";
import type { SessionUser } from "./session";

// Kept out of "@/shared/auth": the locale-aware redirect pulls next-intl's navigation, which
// server modules (and their tests) that only check access must not have to load.

/**
 * The signed-in user with a name, or a redirect to the login, which asks for the name the first
 * time (DESIGN.md: name and phone, once). `nextPath` is where the login returns, without locale.
 */
export async function requireUser(
  nextPath: string,
  actionLocale?: Locale,
): Promise<SessionUser & { name: string }> {
  const user = await getCurrentUser();
  if (user?.name) return { ...user, name: user.name };
  // Server Actions pass their locale: getLocale only works while rendering a route.
  const locale = actionLocale ?? (await getLocale());
  return redirect({ href: { pathname: "/login", query: { next: nextPath } }, locale });
}
