"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "./cn";
import { IconButton } from "./icon-button";

type CopyFieldProps = {
  /** The text to show and copy: a link, a code. Shown whole, wrapping, never truncated. */
  value: string;
  copyLabel: string;
  copiedLabel: string;
  className?: string;
};

/** A value someone has to pass on (an invitation link), with a one-tap copy. Read-only. */
export function CopyField({ value, copyLabel, copiedLabel, className }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={cn("flex items-center gap-2 rounded-control bg-surface-muted ps-4 pe-1 py-1", className)}>
      <span className="min-w-0 flex-1 font-mono text-caption break-all text-ink">{value}</span>
      <IconButton
        variant="ghost"
        label={copied ? copiedLabel : copyLabel}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </IconButton>
    </div>
  );
}
