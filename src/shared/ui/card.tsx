import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const cardVariants = cva("flex flex-col gap-2 rounded-card p-6 shadow-card transition", {
  variants: {
    selected: {
      true: "bg-accent-tint",
      false: "bg-surface",
    },
    interactive: {
      true: "glass-sheen cursor-pointer hover:-translate-y-1 hover:shadow-float",
      false: "",
    },
    size: {
      default: "",
      compact: "p-4",
    },
    // A row inside a panel or another card: a muted block, no lift of its own.
    inset: {
      true: "rounded-control bg-surface-muted p-3 shadow-none",
      false: "glass-wash",
    },
  },
  defaultVariants: { selected: false, interactive: false, size: "default", inset: false },
});

type CardProps = ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & {
    /** Render the child element (a link that opens something) with the card's look. */
    asChild?: boolean;
  };

/**
 * White card with the iridescent wash. `selected` marks the one the map or the detail panel is
 * showing; `interactive` (a card that opens something) lifts and catches the light on hover.
 * `size="compact"` for dense lists; `inset` for a row inside a panel.
 */
export function Card({
  className,
  selected,
  interactive,
  size,
  inset,
  asChild = false,
  ...props
}: CardProps) {
  const Component = asChild ? Slot.Root : "div";
  return (
    <Component className={cn(cardVariants({ selected, interactive, size, inset }), className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-body font-medium text-ink", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-ink-soft", className)} {...props} />;
}
