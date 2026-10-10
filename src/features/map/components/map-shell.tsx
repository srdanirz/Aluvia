"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

import { GoogleMapsProvider } from "@/shared/maps/google-maps-provider";

import type { MapCell } from "../server/map-cells";
import { CellPanel } from "./cell-panel";

export type OpenCell = Pick<MapCell, "count" | "worksites">;

const OpenCellContext = createContext<{
  openCell: OpenCell | null;
  setOpenCell: (cell: OpenCell | null) => void;
} | null>(null);

/**
 * The block whose homes are listed in the panel, set when a block that cannot be split is tapped.
 */
export function useOpenCell() {
  const context = useContext(OpenCellContext);
  if (!context) throw new Error("useOpenCell must be used inside MapShell");
  return context;
}

/**
 * Full-screen map with one floating panel. The map lives in the layout and never unmounts while
 * the panel changes between the emergency, a block's list and a home (ADR 0006: one map load per
 * session). The panel is the route's page, unless a block list is open on top of it.
 */
export function MapShell({ map, panel }: { map: ReactNode; panel: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  const openCellValue = useMemo(() => ({ openCell, setOpenCell }), [openCell]);

  return (
    <QueryClientProvider client={queryClient}>
      <GoogleMapsProvider>
        <OpenCellContext value={openCellValue}>
          <div className="relative h-dvh overflow-hidden">
            <div className="absolute inset-0">{map}</div>
            <div className="absolute inset-x-4 bottom-4 flex max-h-sheet flex-col md:end-auto md:top-4 md:max-h-none md:w-panel">
              {openCell ? <CellPanel cell={openCell} onClose={() => setOpenCell(null)} /> : panel}
            </div>
          </div>
        </OpenCellContext>
      </GoogleMapsProvider>
    </QueryClientProvider>
  );
}
