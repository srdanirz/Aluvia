import type { ComponentProps } from "react";

import type { workItemStatus } from "@/shared/db/schema/enums";

import { Chip } from "./chip";

type WorkItemStatus = (typeof workItemStatus.enumValues)[number];

// The tone of each work status (DESIGN.md): earth waits, rain is underway, moss is done.
const TONE = {
  open_unclaimed: "urgent",
  open_claimed: "pending",
  open_partially_done: "pending",
  open_needs_follow_up: "urgent",
  closed_done: "done",
  closed_done_by_others: "done",
  closed_no_help_wanted: "closed",
  closed_duplicate: "closed",
} as const satisfies Record<WorkItemStatus, "urgent" | "pending" | "done" | "closed">;

/** A work item's status as a Chip. The caller gives the translated label; the color is decided here. */
export function WorkStatusChip({
  status,
  ...props
}: Omit<ComponentProps<typeof Chip>, "tone"> & { status: WorkItemStatus }) {
  return <Chip tone={TONE[status]} {...props} />;
}
