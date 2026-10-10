import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const cardVariants = cva("glass-wash flex flex-col gap-2 rounded-card p-6 shadow-card transition", {
  variants: {
    selected: {
      true: "bg-accent-tint",
      false: "bg-surface",
    },
    interactive: {
      true: "glass-sheen cursor-pointer hover:-translate-y-1 hover:shadow-float",
      false: "",
    },
  },
  defaultVariants: { selected: false, interactive: false },
});

type CardProps = ComponentProps<"div"> & VariantProps<typeof cardVariants>;

/**
 * White card with the iridescent wash. `selected` marks the one the map or the detail panel is
 * showing; `interactive` (a card that opens something) lifts and catches the light on hover.
 */
export function Card({ className, selected, interactive, ...props }: CardProps) {
  return <div className={cn(cardVariants({ selected, interactive }), className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-body font-medium text-ink", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-ink-soft", className)} {...props} />;
}
