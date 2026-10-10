"use client";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, Card, Chip } from "@/shared/ui";

import type { EmergencyNumber } from "../server/queries";

/**
 * Shown first when someone is in danger: Aluvia coordinates cleanup, it does not replace the
 * emergency services (ADR 0007). The numbers are the emergency's own configuration.
 */
export function DangerCard({ numbers }: { numbers: EmergencyNumber[] }) {
  const t = useTranslations("worksites.report.danger");
  return (
    <Card className="animate-enter gap-4">
      <Chip tone="urgent" className="self-start">
        {t("chip")}
      </Chip>
      <p className="text-body text-ink">{numbers.length > 0 ? t("callFirst") : t("callLocal")}</p>
      {numbers.length > 0 ? (
        <div className="flex flex-col gap-3">
          {numbers.map((number) => (
            <Button key={number.phone} variant="secondary" block asChild>
              <a href={`tel:${number.phone.replace(/\s/g, "")}`}>
                <Phone aria-hidden />
                {t("call", { label: number.label, phone: number.phone })}
              </a>
            </Button>
          ))}
        </div>
      ) : null}
      <p className="text-caption text-ink-soft">{t("thenContinue")}</p>
    </Card>
  );
}
