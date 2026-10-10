import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const skeletonVariants = cva(
  "animate-shimmer bg-[linear-gradient(90deg,var(--surface-muted)_25%,var(--line)_50%,var(--surface-muted)_75%)] bg-[length:200%_100%]",
  {
    variants: {
      shape: {
        /** Text lines and fields. */
        block: "rounded-control",
        /** Buttons, chips and anything else shaped as a pill. */
        pill: "rounded-full",
        /** Tiles and cards. */
        card: "rounded-card",
      },
    },
    defaultVariants: { shape: "block" },
  },
);

type SkeletonProps = ComponentProps<"div"> & VariantProps<typeof skeletonVariants>;

/**
 * Placeholder with the exact shape of what is loading. A page's loading.tsx is built only from
 * Skeletons laid out like the final page, so nothing jumps when the content arrives. Size it
 * with classes; its corners come from `shape`.
 */
export function Skeleton({ className, shape, ...props }: SkeletonProps) {
  return <div aria-hidden className={cn(skeletonVariants({ shape }), className)} {...props} />;
}
