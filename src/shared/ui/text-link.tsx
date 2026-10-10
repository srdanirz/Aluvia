import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "./cn";

type TextLinkProps = ComponentProps<"a"> & {
  /** Render the child element (the locale-aware Link, for example) with the link's look. */
  asChild?: boolean;
};

/** A link inside running text, in the accent color and underlined so it never relies on color alone. */
export function TextLink({ className, asChild = false, ...props }: TextLinkProps) {
  const Component = asChild ? Slot.Root : "a";
  return (
    <Component
      className={cn("font-medium text-accent underline underline-offset-2 hover:opacity-85", className)}
      {...props}
    />
  );
}
