"use client";

import { useTranslations } from "next-intl";

import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { discardOutboxEntry, type OutboxEntry } from "@/shared/offline/outbox";
import { useOutbox } from "@/shared/offline/use-outbox";
import { Button, Card, Chip } from "@/shared/ui";

/**
 * Writes of one kind still on this phone: how many wait for signal, and the ones the server
 * refused, with the reason and a way to let go of them. Renders nothing when the queue is empty.
 */
export function PendingWrites({ kind, exceptId }: { kind: OutboxEntry["kind"]; exceptId?: string }) {
  const t = useTranslations("outbox");
  const errorMessage = useErrorMessage();
  const entries = useOutbox().filter((entry) => entry.kind === kind && entry.id !== exceptId);
  const pending = entries.filter((entry) => entry.status === "pending").length;
  const rejected = entries.filter((entry) => entry.status === "rejected");
  if (entries.length === 0) return null;

  return (
    <Card className="gap-3">
      {pending > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Chip tone="pending">{t("waitingChip")}</Chip>
          <p className="text-body-sm text-ink-soft">{t("waiting", { count: pending })}</p>
        </div>
      ) : null}
      {rejected.map((entry) => (
        <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Chip tone="urgent" className="self-start">
              {t("rejectedChip")}
            </Chip>
            <p className="text-body-sm text-ink-soft">{errorMessage(entry.code ?? "unknown")}</p>
          </div>
          <Button variant="ghost" onClick={() => discardOutboxEntry(entry.id)}>
            {t("discard")}
          </Button>
        </div>
      ))}
    </Card>
  );
}
