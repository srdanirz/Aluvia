import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const iconButtonVariants = cva(
  "press inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-icon [&>svg]:stroke-[1.5]",
  {
    variants: {
      variant: {
        surface: "glass-wash bg-glass text-ink shadow-card backdrop-blur-glass hover:bg-surface",
        solid: "bg-action text-on-action hover:opacity-85",
        urgent:
          "glass-wash bg-status-urgent-tint/80 text-ink shadow-card backdrop-blur-glass hover:bg-status-urgent-tint",
        pending:
          "glass-wash bg-status-pending-tint/80 text-ink shadow-card backdrop-blur-glass hover:bg-status-pending-tint",
        ghost: "text-ink-soft hover:bg-surface-muted hover:text-ink",
      },
    },
    defaultVariants: { variant: "surface" },
  },
);

type IconButtonProps = ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants> & {
    /** Accessible name; the icon alone says nothing to a screen reader. */
    label: string;
  };

/** Round 44 px button that holds only an icon. */
export function IconButton({ className, variant, label, type, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant }), className)}
      type={type ?? "button"}
      {...props}
    />
  );
}
