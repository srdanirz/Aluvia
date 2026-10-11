"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Button, Field, Input, SegmentedControl, Spinner } from "@/shared/ui";

import { INVITATION_HOURS, type InvitationActionState } from "../schemas";
import { createInvitationAction } from "../server/actions";
import { InvitationLink } from "./invitation-link";

type Role = "volunteer" | "field_volunteer" | "coordinator";
type Hours = `${(typeof INVITATION_HOURS)[number]}`;

/**
 * Admin form for a new invitation link to an emergency. With `organizationId` the link makes
 * coordinators of that organization (ADR 0019), so the role is fixed.
 */
export function InvitationForm({
  emergencyId,
  organizationId,
}: {
  emergencyId: string;
  organizationId?: string;
}) {
  const t = useTranslations("members.invite");
  const locale = useLocale();
  const tRoles = useTranslations("roles");
  const tErrors = useTranslations("errors");
  const [role, setRole] = useState<Role>(organizationId ? "coordinator" : "volunteer");
  const [hours, setHours] = useState<Hours>("24");
  const [state, dispatch, pending] = useActionState<InvitationActionState, FormData>(
    createInvitationAction.bind(null, { emergencyId, organizationId, locale }),
    null,
  );

  return (
    <form
      className="flex flex-col gap-4"
      action={(formData) => {
        formData.set("role", role);
        formData.set("expiresInHours", hours);
        dispatch(formData);
      }}
    >
      <h3 className="text-subheading font-medium text-ink">
        {organizationId ? t("organizationTitle") : t("title")}
      </h3>
      {organizationId ? null : (
        <SegmentedControl
          label={t("roleLabel")}
          value={role}
          onChange={setRole}
          options={(["volunteer", "field_volunteer", "coordinator"] as const).map((value) => ({
            value,
            label: tRoles(value),
          }))}
        />
      )}
      <SegmentedControl
        label={t("expiryLabel")}
        value={hours}
        onChange={setHours}
        options={INVITATION_HOURS.map((value) => ({
          value: `${value}` as Hours,
          label: t("hours", { hours: value }),
        }))}
      />
      <Field
        id={organizationId ? `invitation-max-uses-${organizationId}` : "invitation-max-uses"}
        label={t("maxUsesLabel")}
        hint={t("maxUsesHint")}
        error={state && !state.ok ? tErrors(state.code) : undefined}
      >
        <Input name="maxUses" inputMode="numeric" pattern="[0-9]*" maxLength={2} />
      </Field>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label={t("create")} /> : null}
          {t("create")}
        </Button>
      </div>
      {state?.ok ? <InvitationLink key={state.path} path={state.path} /> : null}
    </form>
  );
}
