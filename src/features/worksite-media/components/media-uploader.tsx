"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { listOutbox } from "@/shared/offline/outbox";
import { Button, Chip, Spinner } from "@/shared/ui";

import { enqueueMedia } from "./enqueue-media";
import { MediaPicker } from "./media-picker";
import type { PickedMedia } from "./prepare-media";

/**
 * Add photos or a video to a home from its page, no account needed. Queued in the outbox, so a
 * send without signal goes out by itself when it comes back; sent ones appear after a refresh.
 */
export function MediaUploader({ slug, worksiteId }: { slug: string; worksiteId: string }) {
  const t = useTranslations("worksiteMedia.uploader");
  const router = useRouter();
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<"sent" | "queued" | "rejected" | null>(null);

  const send = async () => {
    setSending(true);
    const ids = new Set(items.map((item) => item.id));
    await enqueueMedia({ slug, target: worksiteId, items });
    setSending(false);
    items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
    // What is still in the outbox after the round did not go out: refused, or waiting for signal.
    const left = listOutbox().filter((entry) => ids.has(entry.id));
    setOutcome(
      left.some((entry) => entry.status === "rejected") ? "rejected" : left.length > 0 ? "queued" : "sent",
    );
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <MediaPicker value={items} onChange={setItems} />
      {items.length > 0 ? (
        <Button className="self-start" disabled={sending} onClick={() => void send()}>
          {sending ? <Spinner label={t("sending")} /> : null}
          {sending ? t("sending") : t("send", { count: items.length })}
        </Button>
      ) : null}
      {outcome ? (
        <Chip
          tone={outcome === "sent" ? "done" : outcome === "queued" ? "pending" : "urgent"}
          className="self-start"
        >
          {t(`outcome.${outcome}`)}
        </Chip>
      ) : null}
    </div>
  );
}
