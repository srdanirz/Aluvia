import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

const mapMarkerVariants = cva(
  "inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full text-body-sm font-medium text-surface tabular-nums shadow-float [&>svg]:size-icon-sm [&>svg]:stroke-[1.5]",
  {
    variants: {
      tone: {
        urgent: "bg-status-urgent",
        pending: "bg-status-pending",
        done: "bg-status-done",
        closed: "bg-status-closed",
        // A place, not a home with a status (a donation collection point): brand ink, so it never
        // reads as one of the traffic-light levels.
        place: "bg-ink",
      },
      grouped: {
        true: "px-3",
        false: "",
      },
      selected: {
        true: "z-10 scale-110",
        false: "",
      },
    },
    defaultVariants: { tone: "urgent", grouped: false, selected: false },
  },
);

type MapMarkerProps = Omit<ComponentProps<"span">, "children"> &
  Omit<VariantProps<typeof mapMarkerVariants>, "grouped"> & {
    /** The level's own shape, so the state reads without color (sun glare, color blindness). */
    icon: ReactNode;
    /** Homes in a group; a single home leaves it out. */
    count?: number;
  };

/**
 * What a home or a group of homes looks like on the map: a solid pill in its status color with the
 * status icon, and the count when it is a group, 44 px for a thumb. Visual only: the map's own
 * marker element receives the tap and keyboard focus and carries the spoken name (`title`), since
 * Google's marker sits above its content and swallows the click.
 */
export function MapMarker({ className, tone, selected, icon, count, ...props }: MapMarkerProps) {
  const grouped = count !== undefined;
  return (
    <span aria-hidden className={cn(mapMarkerVariants({ tone, grouped, selected }), className)} {...props}>
      {icon}
      {grouped ? <span>{count}</span> : null}
    </span>
  );
}
