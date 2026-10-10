import type { ReactNode } from "react";

import { cn } from "./cn";

type DescriptionListProps = {
  items: { term: string; value: ReactNode }[];
  className?: string;
};

/** Facts as small label over value, one column on a phone and two from tablet up. */
export function DescriptionList({ items, className }: DescriptionListProps) {
  return (
    <dl className={cn("grid gap-4 md:grid-cols-2", className)}>
      {items.map(({ term, value }) => (
        <div key={term} className="flex flex-col gap-1">
          <dt className="text-caption text-ink-muted">{term}</dt>
          <dd className="text-body text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
