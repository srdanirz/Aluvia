import type { ComponentProps } from "react";

import { cn } from "./cn";

/**
 * Placeholder with the exact shape of what is loading. A page's loading.tsx is built only from
 * Skeletons laid out like the final page, so nothing jumps when the content arrives.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-shimmer rounded-control bg-[linear-gradient(90deg,var(--surface-muted)_25%,var(--line)_50%,var(--surface-muted)_75%)] bg-[length:200%_100%]",
        className,
      )}
      {...props}
    />
  );
}
