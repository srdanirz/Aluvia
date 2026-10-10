"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/shared/ui";

import type { MemberActionState } from "../schemas";

type ElevatedRole = "coordinator" | "field_volunteer";

const LABEL_KEYS = { coordinator: "requestCoordinator", field_volunteer: "requestFieldVolunteer" } as const;

/** Asks for a role; the submit button that was tapped carries which one. */
export function RoleRequestForm({
  action,
  roles,
}: {
  action: (state: MemberActionState, formData: FormData) => Promise<MemberActionState>;
  roles: ElevatedRole[];
}) {
  const t = useTranslations("members.join");
  const tErrors = useTranslations("errors");
  const [state, dispatch, pending] = useActionState(action, null);

  return (
    <form action={dispatch} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <Button key={role} type="submit" name="role" value={role} variant="secondary" disabled={pending}>
            {t(LABEL_KEYS[role])}
          </Button>
        ))}
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-caption text-status-urgent-text">
          {tErrors(state.code)}
        </p>
      ) : null}
    </form>
  );
}
