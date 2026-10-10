import { z } from "zod";

// TODO(#23): stub of feat/observability's catalog. On rebase this file is theirs, which already
// carries worksite_reported; the other events below are added to it.
export const EVENTS = {
  worksite_reported: z.strictObject({
    source: z.enum(["neighbor", "coordinator", "social"]),
    hasLocation: z.boolean(),
    workTypeCount: z.number().int().min(0),
    delivery: z.enum(["sent", "queued"]),
  }),
  worksite_report_rejected: z.strictObject({ code: z.string() }),
  worksite_update_recorded: z.strictObject({
    supplyCount: z.number().int().min(0),
    delivery: z.enum(["sent", "queued"]),
  }),
  worksite_drafts_extracted: z.strictObject({ count: z.number().int().min(0) }),
  worksite_placed: z.strictObject({ hadNearby: z.boolean() }),
};

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = z.infer<(typeof EVENTS)[N]>;
