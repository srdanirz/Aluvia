import type { ComponentProps } from "react";

import { cn } from "./cn";

// 16px text so iOS does not zoom on focus. Focus: white fill plus a soft accent glow, no outline line.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control bg-surface-muted px-4 text-body text-ink placeholder:text-ink-muted outline-none focus:bg-surface focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_30%,transparent),var(--shadow-float-value)] aria-invalid:bg-status-urgent-tint disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
