"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

// One slot per overlay layer, in the order they stack in the column.
const SLOTS = ["zones", "collectionPoints"] as const;
type Slot = (typeof SLOTS)[number];

/** What a tap on the map means right now: nothing special, a zone corner, or a new point's place. */
export type MapTapMode = "idle" | "drawing_zone" | "adding_point";

type Controls = {
  slots: Partial<Record<Slot, HTMLDivElement | null>>;
  mode: MapTapMode;
  setMode: (mode: MapTapMode) => void;
};

const ControlsContext = createContext<Controls | null>(null);

/**
 * The one column of controls floating over the map's top start corner. Each overlay layer (zones,
 * collection points) keeps its own state and puts its buttons and panels in its own slot with
 * `MapControl`, so layers stack in a fixed order instead of covering each other. It also holds the
 * tap mode, so only one layer listens to map taps at a time.
 */
export function MapControlsColumn({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Controls["slots"]>({});
  const [mode, setMode] = useState<MapTapMode>("idle");
  // Stable ref callbacks: a new function per render would detach and reattach every slot.
  const [slotRefs] = useState(
    () =>
      Object.fromEntries(
        SLOTS.map((slot) => [
          slot,
          (node: HTMLDivElement | null) =>
            setSlots((current) => (current[slot] === node ? current : { ...current, [slot]: node })),
        ]),
      ) as Record<Slot, (node: HTMLDivElement | null) => void>,
  );
  const value = useMemo(() => ({ slots, mode, setMode }), [slots, mode]);
  return (
    <ControlsContext value={value}>
      {children}
      <div className="absolute start-4 top-16 flex max-w-narrow flex-col items-start gap-2 md:top-4">
        {SLOTS.map((slot) => (
          <div key={slot} ref={slotRefs[slot]} className="flex flex-col items-start gap-2 empty:hidden" />
        ))}
      </div>
    </ControlsContext>
  );
}

/** Renders its children in the layer's slot of the map's controls column. */
export function MapControl({ slot, children }: { slot: Slot; children: ReactNode }) {
  const node = useContext(ControlsContext)?.slots[slot];
  return node ? createPortal(children, node) : null;
}

/** The map's tap mode; outside a `MapControlsColumn` it is always idle. */
export function useMapTapMode(): [MapTapMode, (mode: MapTapMode) => void] {
  const context = useContext(ControlsContext);
  return context ? [context.mode, context.setMode] : ["idle", () => {}];
}
