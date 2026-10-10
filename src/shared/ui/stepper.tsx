"use client";

import { Minus, Plus } from "lucide-react";

import { cn } from "./cn";

type StepperProps = {
  /** What is being counted ("Personas trabajando ahora"); names the group for screen readers. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  decrementLabel: string;
  incrementLabel: string;
  className?: string;
};

/**
 * A count changed with two big buttons, never typed. Minus is glass, plus is solid black; both
 * are 64 px circles for gloved or muddy hands. The value is announced as it changes.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  decrementLabel,
  incrementLabel,
  className,
}: StepperProps) {
  const button =
    "press inline-flex size-16 shrink-0 items-center justify-center rounded-full disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-icon [&>svg]:stroke-[1.5]";
  return (
    <div role="group" aria-label={label} className={cn("flex items-center justify-between gap-4", className)}>
      <button
        type="button"
        aria-label={decrementLabel}
        title={decrementLabel}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={cn(
          button,
          "glass-wash bg-glass text-ink shadow-card backdrop-blur-glass hover:bg-surface",
        )}
      >
        <Minus />
      </button>
      <output
        aria-live="polite"
        className="min-w-16 text-center font-mono text-display text-ink tabular-nums"
      >
        {value}
      </output>
      <button
        type="button"
        aria-label={incrementLabel}
        title={incrementLabel}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={cn(button, "bg-action text-on-action hover:opacity-85")}
      >
        <Plus />
      </button>
    </div>
  );
}
