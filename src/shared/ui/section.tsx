import { type ComponentProps, useId } from "react";

import { cn } from "./cn";

type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  title: string;
  /** One line under the title saying what the section is for. */
  lead?: string;
  /** The title's id, which names the section for screen readers; generated when not given. */
  titleId?: string;
};

/** A titled block inside a view. Spacing between sections is the parent's (48 px in a view). */
export function Section({ title, lead, titleId, className, children, ...props }: SectionProps) {
  const generatedId = useId();
  const headingId = titleId ?? generatedId;
  return (
    <section aria-labelledby={headingId} className={cn("flex flex-col gap-4", className)} {...props}>
      <header className="flex flex-col gap-1">
        <h2 id={headingId} className="text-subheading font-medium text-ink">
          {title}
        </h2>
        {lead ? <p className="text-body-sm text-ink-soft">{lead}</p> : null}
      </header>
      {children}
    </section>
  );
}
