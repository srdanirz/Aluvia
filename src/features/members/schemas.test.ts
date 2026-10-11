import { describe, expect, it } from "vitest";

import { joinPath, joinReturnPath } from "./schemas";

describe("joinReturnPath", () => {
  it("returns to a home of the same emergency", () => {
    expect(joinReturnPath("aluvion-x", "/emergencies/aluvion-x/worksites/abc")).toBe(
      "/emergencies/aluvion-x/worksites/abc",
    );
  });

  it("falls back to the map for another emergency, an outside URL or nothing", () => {
    for (const next of [
      "/emergencies/other/worksites/abc",
      "//evil.example",
      "https://evil.example",
      undefined,
    ]) {
      expect(joinReturnPath("aluvion-x", next)).toBe("/emergencies/aluvion-x");
    }
  });

  it("does not take a slug that only starts like this one", () => {
    expect(joinReturnPath("aluvion-x", "/emergencies/aluvion-xy/worksites/abc")).toBe(
      "/emergencies/aluvion-x",
    );
  });
});

describe("joinPath", () => {
  it("round-trips the return path through the join page's query", () => {
    const path = joinPath("aluvion-x", "/emergencies/aluvion-x/worksites/abc");
    const next = new URL(path, "https://example.test").searchParams.get("next");
    expect(joinReturnPath("aluvion-x", next)).toBe("/emergencies/aluvion-x/worksites/abc");
  });
});
