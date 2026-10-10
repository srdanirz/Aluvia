"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Card } from "@/shared/ui";

import { updateEmergencyAreaAction } from "../server/actions";
import { AreaFileField } from "./area-file-field";
import { FormStatus } from "./form-status";
import { SubmitButton } from "./submit-button";
import { useAdminAction } from "./use-admin-action";

/** Replaces an open emergency's area with an uploaded GeoJSON polygon. */
export function EmergencyAreaForm({ emergencyId, version }: { emergencyId: string; version: number }) {
  const t = useTranslations("admin.emergencies");
  const router = useRouter();
  const { pending, result, submit, fieldError, formError, isStale } =
    useAdminAction(updateEmergencyAreaAction);
  const [area, setArea] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!area) return;
    submit({ emergencyId, version, area }, () => router.refresh());
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="gap-4">
        <AreaFileField id="area-file" onChange={setArea} error={fieldError("area")} />
      </Card>
      <div className="flex flex-col gap-3">
        <SubmitButton variant="secondary" pending={pending} disabled={!area}>
          {t("areaSubmit")}
        </SubmitButton>
        <FormStatus error={formError} isStale={isStale} saved={result?.ok === true} />
      </div>
    </form>
  );
}
