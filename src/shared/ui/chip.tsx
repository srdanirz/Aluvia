import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const chipVariants = cva(
  "glass-wash inline-flex items-center gap-chip-gap rounded-full px-chip-x py-chip-y text-caption font-medium whitespace-nowrap text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] backdrop-blur-glass",
  {
    variants: {
      tone: {
        urgent: "bg-status-urgent-tint/75 [--dot:var(--status-urgent)]",
        pending: "bg-status-pending-tint/75 [--dot:var(--status-pending)]",
        done: "bg-status-done-tint/75 [--dot:var(--status-done)]",
        closed: "bg-status-closed-tint/75 [--dot:var(--status-closed)]",
        neutral: "bg-glass [--dot:var(--ink-muted)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type ChipProps = ComponentProps<"span"> & VariantProps<typeof chipVariants>;

/**
 * Status pill: tinted glass, a glowing dot and ink text. The text carries the meaning and the
 * color only reinforces it, so a status is never told by color alone.
 */
export function Chip({ className, tone, children, ...props }: ChipProps) {
  return (
    <span className={cn(chipVariants({ tone }), className)} {...props}>
      <span aria-hidden className="size-dot rounded-full bg-[var(--dot)] shadow-[0_0_8px_var(--dot)]" />
      {children}
    </span>
  );
}
