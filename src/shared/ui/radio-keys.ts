import type { KeyboardEvent } from "react";

/**
 * Arrow, Home and End keys for a radiogroup (ARIA radio pattern): move the selection and the
 * focus together. Pair it with `tabIndex={selected ? 0 : -1}` on each radio.
 */
export function handleRadioKeys<T>(
  event: KeyboardEvent<HTMLElement>,
  values: readonly T[],
  value: T,
  select: (next: T) => void,
) {
  const index = values.indexOf(value);
  const last = values.length - 1;
  const target = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowDown: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    ArrowUp: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  const next = values[target];
  if (next === undefined) return;
  select(next);
  const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]');
  radios?.[target]?.focus();
}
