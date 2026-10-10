import type { ComponentProps } from "react";

import { cn } from "./cn";

/**
 * Frosted panel over the map or the aurora: translucent fill, bright edge, a faint iridescent
 * wash. Side panels, bottom sheets and map overlays use it; plain content uses Card.
 */
export function GlassPanel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "glass-wash overflow-hidden rounded-panel bg-glass p-6 shadow-float backdrop-blur-glass",
        className,
      )}
      {...props}
    />
  );
}
