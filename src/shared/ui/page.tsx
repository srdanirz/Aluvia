import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const pageVariants = cva("mx-auto flex min-h-dvh w-full flex-col px-4", {
  variants: {
    width: {
      narrow: "max-w-narrow",
      content: "max-w-content md:px-8",
    },
    // Room for FloatingNav where the route renders one; without it, plain vertical padding.
    nav: {
      true: "pt-8 pb-nav-bottom md:pt-nav-top md:pb-16",
      false: "py-8 md:py-16",
    },
    align: {
      start: "gap-8",
      center: "justify-center gap-6",
    },
  },
  defaultVariants: { width: "narrow", align: "start", nav: true },
});

/** The `<main>` of every full page outside the map: width, gutters and the space the nav takes. */
export function Page({
  className,
  width,
  align,
  nav,
  ...props
}: ComponentProps<"main"> & VariantProps<typeof pageVariants>) {
  return <main className={cn(pageVariants({ width, align, nav }), className)} {...props} />;
}
