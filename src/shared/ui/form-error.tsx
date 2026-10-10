import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "./cn";

const formErrorVariants = cva("text-status-urgent-text", {
  variants: {
    size: {
      /** Under one field (Field uses it). */
      field: "text-caption",
      /** For a whole form or a group of fields: what was not saved and why. */
      form: "text-body-sm",
    },
  },
  defaultVariants: { size: "form" },
});

type FormErrorProps = ComponentProps<"p"> & VariantProps<typeof formErrorVariants>;

/** An error message, announced as it appears. The only place an error's color is decided. */
export function FormError({ className, size, ...props }: FormErrorProps) {
  return <p role="alert" className={cn(formErrorVariants({ size }), className)} {...props} />;
}
