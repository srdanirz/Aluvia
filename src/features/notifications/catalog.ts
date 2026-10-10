import { z } from "zod";

/**
 * Every notification Aluvia sends (ADR 0007). The type fixes the level, who receives it, the
 * params its copy needs and where its link points; a caller cannot raise the level of a notice.
 * Adding a type is one entry here plus `notifications.<type>` in every `messages/*.json`, and a
 * WhatsApp template of the same name if it goes to neighbors (ADR 0010).
 *
 * Params never carry personal data: copy says what happened and links to the app (ADR 0007).
 */

const shiftParams = z.object({ shiftId: z.uuid(), startsAt: z.iso.datetime({ offset: true }) });
const worksiteParams = z.object({ worksiteId: z.uuid() });
const digestParams = z.object({ count: z.string().regex(/^\d+$/) });

type Definition<P extends z.ZodType<Record<string, string>>, R extends "user" | "worksite"> = {
  level: "important" | "shift_reminder" | "normal" | "digest";
  // A worksite recipient is the neighbor behind worksite_contacts, reached only by SMS or WhatsApp.
  recipient: R;
  params: P;
  // Path under /<locale>/emergencies/<slug>/; empty opens the emergency itself.
  path: (params: z.infer<P>) => string;
  // Params rendered as dates in the emergency's time zone.
  dates?: readonly (keyof z.infer<P>)[];
  // Params rendered as numbers, for plurals.
  numbers?: readonly (keyof z.infer<P>)[];
};

const define = <P extends z.ZodType<Record<string, string>>, R extends "user" | "worksite">(
  definition: Definition<P, R>,
) => definition;

export const NOTIFICATION_TYPES = {
  shift_cancelled: define({
    level: "important",
    recipient: "user",
    params: shiftParams,
    path: (p) => `shifts/${p.shiftId}`,
    dates: ["startsAt"],
  }),
  shift_meeting_point_changed: define({
    level: "important",
    recipient: "user",
    params: shiftParams,
    path: (p) => `shifts/${p.shiftId}`,
    dates: ["startsAt"],
  }),
  work_item_reassigned: define({
    level: "important",
    recipient: "user",
    params: worksiteParams,
    path: (p) => `worksites/${p.worksiteId}`,
  }),
  work_item_claimed: define({
    level: "important",
    recipient: "worksite",
    params: worksiteParams,
    path: (p) => `worksites/${p.worksiteId}`,
  }),
  // One call for every volunteer whose reservations lapsed in a sweep, so it names no home.
  work_item_claim_expired: define({
    level: "normal",
    recipient: "user",
    params: z.object({}),
    path: () => "work-items",
  }),
  work_item_needs_follow_up: define({
    level: "normal",
    recipient: "user",
    params: worksiteParams,
    path: (p) => `worksites/${p.worksiteId}`,
  }),
  shift_reminder: define({
    level: "shift_reminder",
    recipient: "user",
    params: shiftParams,
    path: (p) => `shifts/${p.shiftId}`,
    dates: ["startsAt"],
  }),
  shift_created_nearby: define({
    level: "normal",
    recipient: "user",
    params: shiftParams,
    path: (p) => `shifts/${p.shiftId}`,
    dates: ["startsAt"],
  }),
  unattended_worksites_digest: define({
    level: "digest",
    recipient: "user",
    params: digestParams,
    path: () => "",
    numbers: ["count"],
  }),
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
export type NotificationParams<T extends NotificationType> = z.infer<
  (typeof NOTIFICATION_TYPES)[T]["params"]
>;

export function isNotificationType(value: string): value is NotificationType {
  return Object.hasOwn(NOTIFICATION_TYPES, value);
}
