"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, Card, CardBody, CardTitle } from "@/shared/ui";

/** Cookie the page reads on the server, so a dismissed intro never flashes on the next visit. */
export const HELP_INTRO_COOKIE = "aluvia_help_intro_dismissed";
// A year: long enough to outlast any emergency, short enough to not be forever.
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 3600;

/** The one-time explanation of the list (issue #10): closed once, it does not come back. */
export function HelpIntro() {
  const t = useTranslations("work.intro");
  const [isOpen, setIsOpen] = useState(true);
  if (!isOpen) return null;
  const dismiss = () => {
    document.cookie = `${HELP_INTRO_COOKIE}=1; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
    setIsOpen(false);
  };
  return (
    <Card selected className="gap-3">
      <CardTitle>{t("title")}</CardTitle>
      <CardBody>{t("body")}</CardBody>
      <Button variant="secondary" className="self-start" onClick={dismiss}>
        {t("dismiss")}
      </Button>
    </Card>
  );
}
