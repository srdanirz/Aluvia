import { Check, Footprints, HandHelping, type LucideIcon, OctagonX } from "lucide-react";

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

type StatusTone = "urgent" | "pending" | "done";

/**
 * What the public reads (docs/DESIGN.md, "Estados de una casa"): three traffic-light states plus
 * a danger mark. Six internal levels were too many to tell apart in the street; the internal level
 * still orders the map and the lists and explains itself in the home's page (`LEVEL_DETAIL`).
 * Legend order: the danger mark last, apart from the traffic light.
 */
export const HOME_STATES = ["needs_help", "on_the_way", "attended", "do_not_enter"] as const;
export type HomeState = (typeof HOME_STATES)[number];

export const LEVEL_STATE = {
  do_not_enter: "do_not_enter",
  unattended: "needs_help",
  // Nobody knows if it is done: someone should still go, so it reads as needing help.
  unconfirmed: "needs_help",
  no_request: "needs_help",
  in_progress: "on_the_way",
  attended: "attended",
} as const satisfies Record<AttentionLevel, HomeState>;

export const STATE_TONE = {
  needs_help: "urgent",
  on_the_way: "pending",
  attended: "done",
  do_not_enter: "urgent",
} as const satisfies Record<HomeState, StatusTone>;

// Shapes that differ without color (issue #11): a hand asking, footsteps, a check, a stop sign.
// The danger mark also changes the marker's silhouette (`MapMarker shape="sign"`).
export const STATE_ICON: Record<HomeState, LucideIcon> = {
  needs_help: HandHelping,
  on_the_way: Footprints,
  attended: Check,
  do_not_enter: OctagonX,
};

/** Levels whose state needs one more line to be understood; the home's page shows it. */
export const LEVEL_DETAIL: Partial<Record<AttentionLevel, "unconfirmed" | "noRequest">> = {
  unconfirmed: "unconfirmed",
  no_request: "noRequest",
};

/** Work that still needs someone, claimed or not: the `open_*` statuses. */
export function isOpenWorkStatus(status: WorkItemStatus): boolean {
  return status.startsWith("open_");
}

/** Homes per public state, from a group's counts per internal level. */
export function countByState(levels: Record<AttentionLevel, number>): Record<HomeState, number> {
  const counts: Record<HomeState, number> = { needs_help: 0, on_the_way: 0, attended: 0, do_not_enter: 0 };
  for (const level of ATTENTION_LEVELS) counts[LEVEL_STATE[level]] += levels[level];
  return counts;
}

/** The level a group of homes shows: its most urgent one. */
export function mostUrgentLevel(levels: Record<AttentionLevel, number>): AttentionLevel {
  return ATTENTION_LEVELS.find((level) => levels[level] > 0) ?? "attended";
}

/** Sort key of a group, 0 for the most urgent: the position of its most urgent level. */
export function levelRank(levels: Record<AttentionLevel, number>): number {
  return ATTENTION_LEVELS.indexOf(mostUrgentLevel(levels));
}

export type WorkItemStatus = (typeof workItemStatus.enumValues)[number];
