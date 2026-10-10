import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-body-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-action text-on-action hover:opacity-90",
        secondary: "border border-action-line text-action-line hover:bg-surface-muted",
        featured: "border border-accent-line text-accent hover:bg-surface-muted",
        ghost: "text-ink-soft hover:bg-surface-muted hover:text-ink",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, for example) with the button's look. */
    asChild?: boolean;
  };

export function Button({ className, variant, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}
