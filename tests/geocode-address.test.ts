import { afterEach, describe, expect, it, vi } from "vitest";

import { geocodeAddress, geocodingQuery } from "@/features/worksites/server/geocode-address";
import { env } from "@/shared/env";

// Made-up address and box; the Geocoding API is replaced by a fetch stub.
const ADDRESS = "Calle Inventada 500, depto 3";
const AREA = { west: -70.62, south: -33.52, east: -70.58, north: -33.48 };
const BIAS = { area: AREA, comunas: ["Comuna Inventada"] };
const KEY = "test-geocoding-key";

function answer(body: unknown, status = 200) {
  const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const result = (lng: number, lat: number, locationType: string) => ({
  status: "OK",
  results: [{ geometry: { location: { lng, lat }, location_type: locationType } }],
});

// env is parsed once at import; the key is swapped in place and restored after each test.
const originalKey = env.GOOGLE_MAPS_SERVER_KEY;
function withKey(key: string | undefined) {
  env.GOOGLE_MAPS_SERVER_KEY = key;
}

afterEach(() => {
  env.GOOGLE_MAPS_SERVER_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe("geocodingQuery", () => {
  it("joins thousands dots and drops the unit inside the lot", () => {
    expect(geocodingQuery("Calle Inventada 10.745, Casa 4 Y 5")).toBe("Calle Inventada 10745");
    expect(geocodingQuery("Pasaje Inventado 1.200 depto 12")).toBe("Pasaje Inventado 1200");
    expect(geocodingQuery("Calle Inventada 500")).toBe("Calle Inventada 500");
  });

  it("keeps a street whose name holds a unit-like word", () => {
    expect(geocodingQuery("Calle Casablanca 300")).toBe("Calle Casablanca 300");
  });
});

describe("geocodeAddress", () => {
  it("asks Google for Chile in Spanish, biased to the emergency's box and comuna", async () => {
    withKey(KEY);
    const fetchMock = answer(result(-70.6, -33.5, "ROOFTOP"));

    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({
      point: { lng: -70.6, lat: -33.5 },
      outcome: "placed",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    // The unit inside the lot ("depto 3") is dropped: Google would fall back to the street.
    expect(url.searchParams.get("address")).toBe("Calle Inventada 500");
    expect(url.searchParams.get("region")).toBe("cl");
    expect(url.searchParams.get("language")).toBe("es");
    expect(url.searchParams.get("components")).toBe("country:CL|locality:Comuna Inventada");
    expect(url.searchParams.get("bounds")).toBe("-33.52,-70.62|-33.48,-70.58");
    expect(url.searchParams.get("key")).toBe(KEY);
  });

  it("takes an interpolated street number too", async () => {
    withKey(KEY);
    answer(result(-70.6, -33.5, "RANGE_INTERPOLATED"));
    expect((await geocodeAddress(ADDRESS, BIAS)).outcome).toBe("placed");
  });

  it("refuses a result that only knows the street or the comuna", async () => {
    withKey(KEY);
    answer(result(-70.6, -33.5, "GEOMETRIC_CENTER"));
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "imprecise" });
    answer(result(-70.6, -33.5, "APPROXIMATE"));
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "imprecise" });
  });

  it("refuses a precise result far from the emergency's area", async () => {
    withKey(KEY);
    answer(result(-70.3, -33.5, "ROOFTOP"));
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "outside_area" });
  });

  it("never throws: no results, a provider error, a network failure or a timeout give no point", async () => {
    withKey(KEY);
    answer({ status: "ZERO_RESULTS", results: [] });
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "not_found" });
    answer({ status: "REQUEST_DENIED" });
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "failed" });
    answer({}, 500);
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "failed" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      }),
    );
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "failed" });
  });

  it("calls nobody without a server key", async () => {
    withKey(undefined);
    const fetchMock = answer(result(-70.6, -33.5, "ROOFTOP"));
    expect(await geocodeAddress(ADDRESS, BIAS)).toEqual({ point: null, outcome: "off" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
