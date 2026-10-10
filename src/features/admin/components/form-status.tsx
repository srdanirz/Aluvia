"use client";

import { RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/shared/i18n/navigation";
import { Button, Chip, FormError } from "@/shared/ui";

type FormStatusProps = { error?: string; isStale?: boolean; saved?: boolean };

/** What happened to the last submit: the translated error (with Reload when someone else saved), or Saved. */
export function FormStatus({ error, isStale, saved }: FormStatusProps) {
  const t = useTranslations("admin.common");
  const router = useRouter();
  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <FormError>{error}</FormError>
        {isStale ? (
          <Button variant="secondary" onClick={() => router.refresh()}>
            <RotateCw aria-hidden />
            {t("reload")}
          </Button>
        ) : null}
      </div>
    );
  }
  return saved ? (
    <p role="status">
      <Chip tone="done">{t("saved")}</Chip>
    </p>
  ) : null;
}
