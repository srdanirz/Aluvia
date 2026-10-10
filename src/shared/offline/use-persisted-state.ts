"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * State that lives in localStorage, so a half-filled form survives a closed tab or a dead battery
 * (DESIGN.md: input is never lost). The server and the first paint use `initial`; the saved value
 * takes over after hydration. Where storage is blocked (private mode), it falls back to memory and
 * the form keeps working, only without the safety net.
 *
 * `initial` must be stable (a module constant): it is the value whenever nothing is saved.
 */

const CHANGE_EVENT = "aluvia:persisted-state";
const memory = new Map<string, string>();

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, raw: string | null) {
  if (raw === null) memory.delete(key);
  else memory.set(key, raw);
  try {
    if (raw === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, raw);
  } catch {
    // Blocked or full storage: the memory copy above keeps this tab working.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function parse<T>(raw: string | null, initial: T): T {
  if (raw === null) return initial;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return initial;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

export function usePersistedState<T>(
  key: string,
  initial: T,
): [T, (update: (previous: T) => T) => void, () => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );
  const value = useMemo(() => parse(raw, initial), [raw, initial]);

  // Reads the stored value at write time, not the one of the last render: an update that runs
  // after an await must not overwrite edits made in between.
  const update = useCallback(
    (next: (previous: T) => T) => writeRaw(key, JSON.stringify(next(parse(readRaw(key), initial)))),
    [key, initial],
  );
  const clear = useCallback(() => writeRaw(key, null), [key]);
  return [value, update, clear];
}
