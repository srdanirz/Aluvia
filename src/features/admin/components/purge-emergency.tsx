"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Button, Chip, GlassPanel } from "@/shared/ui";

import { purgeEmergencyAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { useAdminAction } from "./use-admin-action";

/**
 * Deletes the personal data of a closed emergency (ADR 0005). Asks once more in place, without a
 * modal: it cannot be undone. Counts of homes and work stay.
 */
export function PurgeEmergency({ emergencyId }: { emergencyId: string }) {
  const t = useTranslations("admin.emergencies");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const { pending, result, submit, formError } = useAdminAction(purgeEmergencyAction);
  const [confirming, setConfirming] = useState(false);

  return (
    <GlassPanel className="flex flex-col gap-4">
      <p className="text-body-sm text-ink-soft">{t("purgeLead")}</p>
      {result?.ok ? (
        <p role="status">
          <Chip tone="done">{t("purgeDone", { count: result.data.usersDeleted })}</Chip>
        </p>
      ) : confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() => submit({ emergencyId }, () => router.refresh())}
          >
            {t("purgeConfirm")}
          </Button>
          <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
            {tCommon("cancel")}
          </Button>
        </div>
      ) : (
        <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
          {t("purgeButton")}
        </Button>
      )}
      <FormStatus error={formError} />
    </GlassPanel>
  );
}
