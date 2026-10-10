import type { ComponentProps } from "react";

import type { collectionPointStatus } from "@/shared/db/schema/enums";

import { Chip } from "./chip";

type CollectionPointStatus = (typeof collectionPointStatus.enumValues)[number];

// Moss: bring things. Earth: only what the note and list say. Grey: do not bring anything now.
const TONE = {
  receiving: "done",
  only_some: "pending",
  full: "closed",
} as const satisfies Record<CollectionPointStatus, "pending" | "done" | "closed">;

/** A collection point's status as a Chip. The caller gives the translated label; the color is decided here. */
export function CollectionPointStatusChip({
  status,
  ...props
}: Omit<ComponentProps<typeof Chip>, "tone"> & { status: CollectionPointStatus }) {
  return <Chip tone={TONE[status]} {...props} />;
}
