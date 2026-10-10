import { Upload } from "lucide-react";
import type { ComponentProps } from "react";

import { buttonVariants } from "./button";
import { cn } from "./cn";

type FileButtonProps = Omit<ComponentProps<"input">, "type" | "className"> & {
  label: string;
  className?: string;
};

/**
 * A file picker that looks like a secondary Button. The native input stays in the DOM (hidden
 * visually) so the keyboard and screen readers reach it; its focus ring is drawn on the pill.
 */
export function FileButton({ label, className, ...props }: FileButtonProps) {
  return (
    <label
      className={cn(
        buttonVariants({ variant: "secondary" }),
        "cursor-pointer has-[:disabled]:pointer-events-none has-[:disabled]:opacity-40 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        className,
      )}
    >
      <Upload aria-hidden />
      {label}
      <input type="file" className="sr-only" {...props} />
    </label>
  );
}
