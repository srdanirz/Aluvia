"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Button, GlassPanel } from "@/shared/ui";

import { closeEmergencyAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { useAdminAction } from "./use-admin-action";

/** Closing asks once more in place, without a modal: it cannot be undone from the admin. */
export function CloseEmergency({ emergencyId }: { emergencyId: string }) {
  const t = useTranslations("admin.emergencies");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const { pending, submit, formError } = useAdminAction(closeEmergencyAction);
  const [confirming, setConfirming] = useState(false);

  return (
    <GlassPanel className="flex flex-col gap-4">
      <p className="text-body-sm text-ink-soft">{t("closeLead")}</p>
      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => submit({ emergencyId }, () => router.refresh())}
          >
            {t("closeConfirm")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            {tCommon("cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
          {t("closeButton")}
        </Button>
      )}
      <FormStatus error={formError} />
    </GlassPanel>
  );
}
