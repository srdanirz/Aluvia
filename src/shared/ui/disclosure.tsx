import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "./cn";

/**
 * Content folded behind a one-line label, open on tap. Native details/summary, so it works
 * without JavaScript and screen readers announce it as expandable.
 */
export function Disclosure({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group", className)}>
      <summary className="press flex min-h-11 cursor-pointer list-none items-center gap-2 text-caption text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown
          aria-hidden
          className="size-icon-sm transition group-open:rotate-180"
          strokeWidth={1.5}
        />
        {label}
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}
