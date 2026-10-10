import { Slot } from "radix-ui";
import type { ReactNode } from "react";

import { Label } from "./label";

type FieldProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** The control. Field gives it `id`, `aria-describedby` and `aria-invalid`; do not set them yourself. */
  children: ReactNode;
};

/** Label, control, hint and error in a fixed order and spacing. Every form field goes through it. */
export function Field({ id, label, hint, error, children }: FieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Slot.Root id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
        {children}
      </Slot.Root>
      {hint && !error ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-status-urgent-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
