"use client";

import { Check, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { track } from "@/shared/analytics/client";
import { Button } from "@/shared/ui";

const FEEDBACK_MS = 2500;

type Feedback = "idle" | "copied" | "failed";

/**
 * Shares the page's own link: the phone's share sheet (WhatsApp first, in practice), or a copy to
 * the clipboard where there is none. The link opens the home directly (DESIGN.md, Link).
 */
export function ShareButton({ title }: { title: string }) {
  const t = useTranslations("worksite");
  const [feedback, setFeedback] = useState<Feedback>("idle");
  const timeout = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timeout.current), []);

  function show(next: Feedback) {
    setFeedback(next);
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => setFeedback("idle"), FEEDBACK_MS);
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        track("worksite_shared", { method: "share_sheet" });
      } else {
        await navigator.clipboard.writeText(url);
        show("copied");
        track("worksite_shared", { method: "clipboard" });
      }
    } catch (error) {
      // Closing the share sheet rejects with AbortError: a choice, not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      show("failed");
    }
  }

  return (
    <Button onClick={() => void share()}>
      {feedback === "copied" ? <Check aria-hidden /> : <Share2 aria-hidden />}
      <span aria-live="polite">
        {feedback === "copied" ? t("copied") : feedback === "failed" ? t("shareFailed") : t("share")}
      </span>
    </Button>
  );
}
