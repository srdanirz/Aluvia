import { describe, expect, it } from "vitest";

import { clusterFactorForZoom, CELL_DEGREES } from "./grid";
import { parseMapCellsQuery } from "./schemas";

const query = (bbox: string, zoom: string) => parseMapCellsQuery("test", new URLSearchParams({ bbox, zoom }));

describe("parseMapCellsQuery", () => {
  it("accepts a phone-sized viewport at street zoom", () => {
    expect(query("-80.21,-40.11,-80.2,-40.1", "17")).toMatchObject({
      ok: true,
      data: { bbox: { west: -80.21, south: -40.11, east: -80.2, north: -40.1 }, zoom: 17 },
    });
  });

  it.each([
    ["three numbers", "-80.2,-40.1,-80.1", "10"],
    ["an empty part", "-80.2,,-80.1,-40.0", "10"],
    ["west past east", "-80.1,-40.1,-80.2,-40.0", "10"],
    ["latitude out of range", "-80.2,-95,-80.1,-40.0", "10"],
    ["a fractional zoom", "-80.2,-40.1,-80.1,-40.0", "10.5"],
    ["no zoom", "-80.2,-40.1,-80.1,-40.0", ""],
  ])("rejects %s", (_, bbox, zoom) => {
    expect(query(bbox, zoom)).toEqual({ ok: false, code: "invalid_query" });
  });

  it("rejects a whole country at street zoom", () => {
    expect(query("-76,-56,-66,-17", "20")).toEqual({ ok: false, code: "bbox_too_large" });
  });
});

describe("clusterFactorForZoom", () => {
  it("never splits below a block cell and doubles per zoom level out", () => {
    expect(clusterFactorForZoom(22)).toBe(1);
    expect(clusterFactorForZoom(18)).toBe(1);
    expect(clusterFactorForZoom(15)).toBe(2 * clusterFactorForZoom(16));
    // At least ~100 px per cluster cell on 256 px tiles.
    expect(clusterFactorForZoom(10) * CELL_DEGREES).toBeGreaterThanOrEqual(360 / 2 ** 10 / 2.5);
  });
});
