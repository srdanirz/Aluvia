"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { getPathname, Link } from "@/shared/i18n/navigation";
import { shareLink } from "@/shared/offline/share-link";
import { Button, ButtonGroup, Card, Chip, FormError } from "@/shared/ui";

type ReportDoneProps = {
  slug: string;
  worksiteId: string;
  delivery: "sent" | "queued";
  onAnother: () => void;
};

/** After sending: what happened, a link to the home (only once the server has it) and the next report. */
export function ReportDone({ slug, worksiteId, delivery, onAnother }: ReportDoneProps) {
  const t = useTranslations("worksites.report.done");
  const locale = useLocale();
  const [shared, setShared] = useState<"idle" | "copied" | "failed">("idle");
  const href = `/emergencies/${slug}/worksites/${worksiteId}`;

  const share = async () => {
    const url = new URL(getPathname({ href, locale }), window.location.origin).toString();
    const outcome = await shareLink(url, t("shareTitle"));
    setShared(outcome === "shared" ? "idle" : outcome);
  };

  return (
    <Card className="animate-enter gap-4">
      <Chip tone={delivery === "sent" ? "done" : "pending"} className="self-start">
        {delivery === "sent" ? t("sentChip") : t("queuedChip")}
      </Chip>
      <h2 className="text-heading-sm text-ink">{delivery === "sent" ? t("sentTitle") : t("queuedTitle")}</h2>
      <p className="text-body text-ink-soft">{delivery === "sent" ? t("sentBody") : t("queuedBody")}</p>
      {delivery === "sent" ? (
        <ButtonGroup label={t("actions")} className="w-full">
          <Button variant="ghost" asChild className="flex-1">
            <Link href={href}>{t("view")}</Link>
          </Button>
          <Button onClick={() => void share()} className="flex-1">
            {shared === "copied" ? t("copied") : t("share")}
          </Button>
          <Button variant="ghost" onClick={onAnother} className="flex-1">
            {t("another")}
          </Button>
        </ButtonGroup>
      ) : (
        <Button onClick={onAnother} block>
          {t("another")}
        </Button>
      )}
      {shared === "failed" ? <FormError size="field">{t("shareFailed")}</FormError> : null}
    </Card>
  );
}
