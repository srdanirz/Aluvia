import type { ComponentProps } from "react";

import { cn } from "./cn";

// Multi-line sibling of Input: same frosted glass, 16px text and focus lift. Grows with its rows.
export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(
        "w-full resize-y rounded-control bg-glass px-4 py-3 text-body text-ink shadow-card backdrop-blur-glass placeholder:text-ink-muted outline-none focus:bg-glass-hover focus:shadow-float aria-invalid:bg-status-urgent-tint/60 disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
