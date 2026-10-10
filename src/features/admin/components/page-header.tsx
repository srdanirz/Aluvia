import type { ReactNode } from "react";

/** Title of an admin view, its optional lead and its one main action. */
export function PageHeader({ title, lead, action }: { title: string; lead?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex max-w-prose flex-col gap-2">
        <h1 className="text-heading text-ink">{title}</h1>
        {lead ? <p className="text-body text-ink-soft">{lead}</p> : null}
      </div>
      {action}
    </header>
  );
}
