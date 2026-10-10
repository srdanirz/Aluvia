"use client";

import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type ToggleTileProps = Omit<ComponentProps<"button">, "onChange"> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  /** Optional Lucide icon above the label. */
  icon?: ReactNode;
};

/**
 * Large on/off tile for picking things with one tap and dirty hands (needs, missing supplies).
 * Off is glass; on is solid black with a check, so the state reads without color. 64 px tall,
 * the label wraps instead of truncating.
 */
export function ToggleTile({
  pressed,
  onPressedChange,
  icon,
  className,
  children,
  type,
  ...props
}: ToggleTileProps) {
  return (
    <button
      type={type ?? "button"}
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "press flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-card px-4 py-3 text-center text-body font-medium text-balance disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-icon [&>svg]:shrink-0 [&>svg]:stroke-[1.5]",
        pressed
          ? "bg-action text-on-action shadow-float"
          : "glass-wash bg-glass text-ink shadow-card backdrop-blur-glass hover:bg-glass-hover",
        className,
      )}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
