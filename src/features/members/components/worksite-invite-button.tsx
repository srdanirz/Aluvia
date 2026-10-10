"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, FormError, Spinner } from "@/shared/ui";

import type { InvitationActionState } from "../schemas";
import { createInvitationAction } from "../server/actions";
import { InvitationLink } from "./invitation-link";

// A home's invitation is for one field volunteer, sent now: single use, three days.
const WORKSITE_INVITATION_HOURS = "72";

export function WorksiteInviteButton({
  emergencyId,
  worksiteId,
}: {
  emergencyId: string;
  worksiteId: string;
}) {
  const t = useTranslations("members.assignments");
  const locale = useLocale();
  const tErrors = useTranslations("errors");
  const [state, dispatch, pending] = useActionState<InvitationActionState, FormData>(
    createInvitationAction.bind(null, { emergencyId, worksiteId, locale }),
    null,
  );

  return (
    <form
      className="flex flex-col gap-3"
      action={(formData) => {
        formData.set("role", "field_volunteer");
        formData.set("expiresInHours", WORKSITE_INVITATION_HOURS);
        formData.set("maxUses", "1");
        dispatch(formData);
      }}
    >
      <div className="flex flex-col gap-1">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Spinner label={t("inviteHere")} /> : null}
          {t("inviteHere")}
        </Button>
        <p className="text-caption text-ink-muted">{t("inviteHint")}</p>
      </div>
      {state && !state.ok ? <FormError size="field">{tErrors(state.code)}</FormError> : null}
      {state?.ok ? <InvitationLink key={state.path} path={state.path} /> : null}
    </form>
  );
}
