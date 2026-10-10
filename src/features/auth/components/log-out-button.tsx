"use client";

import { LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { resetAnalytics } from "@/shared/analytics/client";
import { Button } from "@/shared/ui";

import { logOut } from "../server/actions";

/** Ends the session and forgets the analytics identity, so a shared phone starts clean. */
export function LogOutButton() {
  const t = useTranslations("auth");
  const locale = useLocale();
  return (
    <form action={logOut.bind(null, locale)} onSubmit={() => resetAnalytics()}>
      <Button type="submit" variant="ghost">
        <LogOut aria-hidden />
        {t("logOut")}
      </Button>
    </form>
  );
}
