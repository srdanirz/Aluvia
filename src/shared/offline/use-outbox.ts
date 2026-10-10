"use client";

import { useSyncExternalStore } from "react";

import { listOutbox, type OutboxEntry, subscribeOutbox } from "./outbox";

const EMPTY: OutboxEntry[] = [];
let cache: { raw: string; entries: OutboxEntry[] } = { raw: "[]", entries: EMPTY };

// useSyncExternalStore needs a stable snapshot between changes, so the parsed list is reused
// while the serialized queue is unchanged.
function snapshot(): OutboxEntry[] {
  const entries = listOutbox();
  const raw = JSON.stringify(entries);
  if (raw !== cache.raw) cache = { raw, entries };
  return cache.entries;
}

/** The writes still waiting on this device, kept in sync across tabs. Empty during SSR. */
export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(subscribeOutbox, snapshot, () => EMPTY);
}
