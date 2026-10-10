import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "./cn";

/**
 * Native select in the Input's frosted glass, so phones open their own picker. Goes inside
 * `Field` like Input; Field's id and aria props land on the select itself.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative flex w-full", className)}>
      <select
        className="min-h-11 w-full appearance-none rounded-control bg-glass ps-4 pe-11 text-body text-ink shadow-card backdrop-blur-glass outline-none focus:bg-glass-hover focus:shadow-float aria-invalid:bg-status-urgent-tint/60 disabled:opacity-40"
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-4 my-auto size-icon-sm stroke-[1.5] text-ink-muted"
      />
    </span>
  );
}
