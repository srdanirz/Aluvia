"use client";

import { HardHat, ShieldAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button, ButtonGroup, Card, FormError, Spinner } from "@/shared/ui";

import { claimWorksiteAction } from "../server/actions";
import { useAction } from "@/shared/lib/use-action";

type ClaimButtonProps = { emergencyId: string; worksiteId: string; label: string };

/**
 * "Voy para allá" for a whole home (every free job of it), with the safety check in between (one more tap, never a modal): what to wear and
 * when not to go in. The server decides the claim; a refusal shows its translated code here.
 */
export function ClaimButton({ emergencyId, worksiteId, label }: ClaimButtonProps) {
  const t = useTranslations("work.safety");
  const tWork = useTranslations("work");
  const [isConfirming, setIsConfirming] = useState(false);
  const { run, isPending, error } = useAction();

  if (!isConfirming) {
    return (
      <Button variant="accent" block onClick={() => setIsConfirming(true)}>
        {label}
      </Button>
    );
  }
  return (
    <Card selected className="animate-enter gap-3">
      <p className="flex items-center gap-2 text-body font-medium text-ink">
        <HardHat aria-hidden className="size-icon-sm" strokeWidth={1.5} />
        {t("title")}
      </p>
      <ul className="flex list-disc flex-col gap-1 ps-5 text-body-sm text-ink-soft">
        <li>{t("boots")}</li>
        <li>{t("gloves")}</li>
        <li>{t("tetanus")}</li>
      </ul>
      <p className="flex items-start gap-2 text-body-sm text-ink">
        <ShieldAlert aria-hidden className="size-icon-sm shrink-0" strokeWidth={1.5} />
        {t("danger")}
      </p>
      {error ? <FormError>{error}</FormError> : null}
      <ButtonGroup label={label} className="w-full">
        <Button
          variant="ghost"
          size="compact"
          className="flex-1"
          onClick={() => setIsConfirming(false)}
          disabled={isPending}
        >
          {t("cancel")}
        </Button>
        <Button
          size="compact"
          className="flex-1"
          disabled={isPending}
          onClick={() =>
            run(
              () => claimWorksiteAction({ emergencyId, worksiteId }),
              () => setIsConfirming(false),
            )
          }
        >
          {isPending ? <Spinner label={tWork("saving")} /> : null}
          {t("confirm")}
        </Button>
      </ButtonGroup>
    </Card>
  );
}
