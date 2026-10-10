"use client";

import { cn } from "./cn";
import { handleRadioKeys } from "./radio-keys";
import { indicatorClassName, indicatorItemClassName, useSlidingIndicator } from "./use-sliding-indicator";

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

/**
 * Two to four mutually exclusive views ("Sin tomar" / "Tomados") in one glass pill. The black
 * indicator slides and stretches to the chosen one.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const { containerRef, indicatorRef } = useSlidingIndicator<HTMLDivElement, HTMLSpanElement>(value);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      className={cn(
        "group glass-wash relative grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-glass p-1 shadow-card backdrop-blur-glass",
        className,
      )}
    >
      <span ref={indicatorRef} aria-hidden className={indicatorClassName} />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-active={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) =>
              handleRadioKeys(
                event,
                options.map((o) => o.value),
                value,
                onChange,
              )
            }
            className={cn(
              "press min-h-11 rounded-full px-4 text-body-sm font-medium text-ink-soft hover:text-ink",
              indicatorItemClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
