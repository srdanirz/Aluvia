"use client";

import { useTranslations } from "next-intl";

import { Button, ButtonGroup, FormError } from "@/shared/ui";

import { markWorkItemStatusAction, verifyWorkItemAction } from "../server/actions";
import { useAction } from "@/shared/lib/use-action";

/** A coordinator's checks on a job seen in the field (issue #13): verified, or a duplicate. */
export function CoordinatorJobActions({
  emergencyId,
  workItemId,
  version,
  isVerified,
  isOpen,
}: {
  emergencyId: string;
  workItemId: string;
  version: number;
  isVerified: boolean;
  isOpen: boolean;
}) {
  const t = useTranslations("work.jobs");
  const { run, isPending, error } = useAction();
  const ref = { emergencyId, workItemId, version };
  if (isVerified && !isOpen) return null;
  return (
    <div className="flex flex-col gap-2">
      <ButtonGroup label={t("coordinatorActions")}>
        {isVerified ? null : (
          <Button variant="ghost" disabled={isPending} onClick={() => run(() => verifyWorkItemAction(ref))}>
            {t("verify")}
          </Button>
        )}
        {isOpen ? (
          <Button
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => markWorkItemStatusAction({ ...ref, status: "closed_duplicate" }))}
          >
            {t("duplicate")}
          </Button>
        ) : null}
      </ButtonGroup>
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
