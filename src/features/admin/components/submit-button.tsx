import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Button, Spinner } from "@/shared/ui";

type SubmitButtonProps = {
  pending: boolean;
  disabled?: boolean;
  /** `secondary` when the view already has its one primary action (DESIGN.md). */
  variant?: "primary" | "secondary";
  children: ReactNode;
};

/** The form's one primary action; while saving it shows a Spinner and cannot be pressed twice. */
export function SubmitButton({
  pending,
  disabled = false,
  variant = "primary",
  children,
}: SubmitButtonProps) {
  const t = useTranslations("admin.common");
  return (
    <Button type="submit" variant={variant} disabled={pending || disabled} className="self-start">
      {pending ? <Spinner label={t("saving")} /> : null}
      {pending ? t("saving") : children}
    </Button>
  );
}
