import type { ComponentProps } from "react";

import { cn } from "./cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-subheading font-medium text-ink-strong", className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-ink-soft", className)} {...props} />;
}
