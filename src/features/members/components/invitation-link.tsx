"use client";

import { MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button, CopyField } from "@/shared/ui";

/** The link of a new invitation, ready to copy or send by WhatsApp. It is shown once. */
export function InvitationLink({ path }: { path: string }) {
  const t = useTranslations("members.invite");
  // Rendered only after the action returns, in the browser, where the origin is known.
  const url = new URL(path, window.location.origin).toString();
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { url }))}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-soft">{t("ready")}</p>
      <CopyField value={url} copyLabel={t("copy")} copiedLabel={t("copied")} />
      <div>
        <Button variant="secondary" asChild>
          <a href={whatsapp} target="_blank" rel="noreferrer">
            <MessageCircle aria-hidden />
            {t("whatsapp")}
          </a>
        </Button>
      </div>
    </div>
  );
}
