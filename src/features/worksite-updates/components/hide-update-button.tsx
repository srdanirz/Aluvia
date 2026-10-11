"use client";

import { useTranslations } from "next-intl";

import { useAction } from "@/shared/lib/use-action";
import { Button, FormError } from "@/shared/ui";

import { cancelWorksiteUpdateAction } from "../server/actions";

/** A coordinator hides one update (ADR 0018); the home falls back to the one before it. */
export function HideUpdateButton({ emergencyId, updateId }: { emergencyId: string; updateId: string }) {
  const t = useTranslations("worksiteUpdates.state");
  const { run, isPending, error } = useAction();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="compact"
        className="self-start"
        disabled={isPending}
        onClick={() => run(() => cancelWorksiteUpdateAction({ emergencyId, updateId }))}
      >
        {t("hide")}
      </Button>
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
