import type { ComponentProps } from "react";

import { cn } from "./cn";

// Frosted glass field. 16px text so iOS does not zoom on focus. Focus: brighter glass that lifts
// with the neutral float shadow; no colored glow and nothing around the field.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-control bg-glass px-4 text-body text-ink shadow-card backdrop-blur-glass placeholder:text-ink-muted outline-none focus:bg-glass-hover focus:shadow-float aria-invalid:bg-status-urgent-tint/60 disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
