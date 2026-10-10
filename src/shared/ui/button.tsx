import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const buttonVariants = cva(
  "press inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-body-sm font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-icon-sm [&>svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        primary: "bg-action text-on-action hover:opacity-85",
        secondary: "glass-wash bg-glass text-ink shadow-card backdrop-blur-glass hover:bg-surface",
        accent: "bg-accent text-on-accent hover:opacity-90",
        ghost: "text-ink-soft hover:bg-surface-muted hover:text-ink",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "primary" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (a link, for example) with the button's look. */
    asChild?: boolean;
  };

/** Pill button. One `primary` per view; `secondary` for the rest. */
export function Button({ className, variant, block, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      className={cn(buttonVariants({ variant, block }), className)}
      type={asChild ? undefined : (type ?? "button")}
      {...props}
    />
  );
}
