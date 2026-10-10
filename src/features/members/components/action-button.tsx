"use client";

import { useTranslations } from "next-intl";
import { type ComponentProps, useActionState } from "react";

import { Button, FormError, Spinner } from "@/shared/ui";

import type { MemberActionState } from "../schemas";

type ActionButtonProps = {
  /** A Server Action with its target already bound. */
  action: () => Promise<MemberActionState>;
  label: string;
  variant?: ComponentProps<typeof Button>["variant"];
  block?: boolean;
};

/** One-tap member action (approve, revoke, assign) that shows its own error under the button. */
export function ActionButton({ action, label, variant = "secondary", block }: ActionButtonProps) {
  const t = useTranslations("members");
  const tErrors = useTranslations("errors");
  const [state, run, pending] = useActionState(action, null);

  return (
    <form action={run} className="flex flex-col gap-1">
      <Button type="submit" variant={variant} block={block} disabled={pending}>
        {pending ? <Spinner label={t("pending")} /> : null}
        {label}
      </Button>
      {state && !state.ok ? <FormError size="field">{tErrors(state.code)}</FormError> : null}
    </form>
  );
}
