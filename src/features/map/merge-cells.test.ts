import { describe, expect, it } from "vitest";

import { mergeOverlappingCells } from "./merge-cells";
import type { MapCell } from "./server/map-cells";

const levels = (noRequest: number, unattended = 0): MapCell["levels"] => ({
  do_not_enter: 0,
  unattended,
  unconfirmed: 0,
  no_request: noRequest,
  in_progress: 0,
  attended: 0,
});

function cell(lat: number, lng: number, count: number, unattended = 0): MapCell {
  return {
    position: { lat, lng },
    count,
    levels: levels(count - unattended, unattended),
    worksites: null,
    bounds: { west: lng - 0.001, south: lat - 0.001, east: lng + 0.001, north: lat + 0.001 },
  };
}

describe("mergeOverlappingCells", () => {
  it("folds pins closer than the minimum into one group that keeps every count", () => {
    // ~0.0005° apart: about 2 px at zoom 12, far below an 80 px pin.
    const merged = mergeOverlappingCells(
      [cell(-33.41, -70.53, 1026), cell(-33.4105, -70.5305, 190, 3)],
      12,
      80,
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.count).toBe(1216);
    expect(merged[0]?.levels.unattended).toBe(3);
    expect(merged[0]?.worksites).toBeNull();
  });

  it("leaves pins that are far enough apart alone", () => {
    // ~0.05° apart: hundreds of pixels at zoom 14.
    const cells = [cell(-33.41, -70.53, 10), cell(-33.46, -70.58, 20)];
    expect(mergeOverlappingCells(cells, 14, 80)).toHaveLength(2);
  });
});
