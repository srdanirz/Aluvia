import type { ComponentProps } from "react";

import { cn } from "./cn";

// Paper-form input: bottom rule only, 16px text so iOS does not zoom on focus.
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-none border-0 border-b border-ink-soft bg-surface-muted px-3 text-body text-ink placeholder:text-ink-muted focus-visible:border-b-2 focus-visible:border-accent-line focus-visible:outline-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
