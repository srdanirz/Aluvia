import { Check, CircleHelp, House, type LucideIcon, OctagonX, Shovel, TriangleAlert } from "lucide-react";

import type { workItemStatus } from "@/shared/db/schema/enums";

/**
 * How much help a home has (ADR 0011), most urgent first. Derived on every read, never stored:
 * - `unattended`: open work and nobody on it, or no work recorded yet.
 * - `do_not_enter`: someone reported a hazard (electricity, gas, structure) and no coordinator
 *   has reviewed it yet; nobody can claim its work until then. Below `unattended` so one risky
 *   home does not paint a whole group as a no-go area.
 * - `unconfirmed`: would be unattended, but nobody touched it for the emergency's stale window;
 *   it may already be clean, so it is not shown as urgent.
 * - `no_request`: in an official survey of affected homes, with no work asked for yet: someone
 *   should go and ask, but nobody is known to be waiting.
 * - `in_progress`: at least one open work item has someone on it.
 * - `attended`: it has work items and all of them are closed.
 */
export const ATTENTION_LEVELS = [
  "unattended",
  "do_not_enter",
  "unconfirmed",
  "no_request",
  "in_progress",
  "attended",
] as const;
export type AttentionLevel = (typeof ATTENTION_LEVELS)[number];

type StatusTone = "urgent" | "pending" | "done" | "closed";

export const LEVEL_TONE = {
  do_not_enter: "urgent",
  unattended: "urgent",
  unconfirmed: "closed",
  no_request: "closed",
  in_progress: "pending",
  attended: "done",
} as const satisfies Record<AttentionLevel, StatusTone>;

// Silhouettes that differ without color (issue #11): a warning, a question, a house, a shovel, a
// check.
export const LEVEL_ICON: Record<AttentionLevel, LucideIcon> = {
  do_not_enter: OctagonX,
  unattended: TriangleAlert,
  unconfirmed: CircleHelp,
  no_request: House,
  in_progress: Shovel,
  attended: Check,
};

/** The level a group of homes shows: its most urgent one. */
export function mostUrgentLevel(levels: Record<AttentionLevel, number>): AttentionLevel {
  return ATTENTION_LEVELS.find((level) => levels[level] > 0) ?? "attended";
}

/** Sort key of a group, 0 for the most urgent: the position of its most urgent level. */
export function levelRank(levels: Record<AttentionLevel, number>): number {
  return ATTENTION_LEVELS.indexOf(mostUrgentLevel(levels));
}

export type WorkItemStatus = (typeof workItemStatus.enumValues)[number];
