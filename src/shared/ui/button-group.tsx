import type { ComponentProps } from "react";

import { cn } from "./cn";

type ButtonGroupProps = ComponentProps<"div"> & {
  /** What the actions have in common ("Acciones de la casa"); read by screen readers. */
  label: string;
};

/**
 * Three or more related actions in a row live in one long pill, not as loose buttons.
 * Children are `Button variant="ghost"` or `IconButton variant="ghost"`; at most one `primary`
 * or `solid` inside marks the main action.
 */
export function ButtonGroup({ label, className, ...props }: ButtonGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "glass-wash inline-flex w-fit items-center gap-1 rounded-full bg-glass p-1 shadow-card backdrop-blur-glass",
        className,
      )}
      {...props}
    />
  );
}
