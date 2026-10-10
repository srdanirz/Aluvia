"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/shared/ui";

/** The link of a new invitation, ready to copy or send by WhatsApp. It is shown once. */
export function InvitationLink({ path }: { path: string }) {
  const t = useTranslations("members.invite");
  const [copied, setCopied] = useState(false);
  // Rendered only after the action returns, in the browser, where the origin is known.
  const url = new URL(path, window.location.origin).toString();
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { url }))}`;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-soft">{t("ready")}</p>
      <p className="rounded-control bg-surface-muted px-4 py-3 font-mono text-caption break-all text-ink">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t("copied") : t("copy")}
        </Button>
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
