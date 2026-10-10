"use client";

import { useTranslations } from "next-intl";

import { useAction } from "@/shared/lib/use-action";
import { Button, FormError, Spinner } from "@/shared/ui";

import { cancelShiftSignupAction, signUpForShiftAction } from "../server/actions";

/** Sign up or give the seat back. The seat count is decided by the database, never here. */
export function SignupButton({
  emergencyId,
  shiftId,
  isSignedUp,
  isFull,
}: {
  emergencyId: string;
  shiftId: string;
  isSignedUp: boolean;
  isFull: boolean;
}) {
  const t = useTranslations("shifts");
  const tWork = useTranslations("work");
  const { run, isPending, error } = useAction();
  const ref = { emergencyId, shiftId };
  return (
    <div className="flex flex-col gap-2">
      {isSignedUp ? (
        <Button
          variant="secondary"
          block
          disabled={isPending}
          onClick={() => run(() => cancelShiftSignupAction(ref))}
        >
          {isPending ? <Spinner label={tWork("saving")} /> : null}
          {t("cancel")}
        </Button>
      ) : (
        <Button
          variant="accent"
          block
          disabled={isPending || isFull}
          onClick={() => run(() => signUpForShiftAction(ref))}
        >
          {isPending ? <Spinner label={tWork("saving")} /> : null}
          {isFull ? t("full") : t("signUp")}
        </Button>
      )}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}
