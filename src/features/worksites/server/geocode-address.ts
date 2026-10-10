import "server-only";

import { env } from "@/shared/env";
import { meter } from "@/shared/observability/metrics";
import { logWarn } from "@/shared/observability/logger";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
// A report waits on this before it is saved; past it the report is saved without a point.
const TIMEOUT_MS = 3000;
// A street address or a point interpolated between two numbered ones finds the door; anything
// coarser (GEOMETRIC_CENTER of a street, APPROXIMATE of a comuna) would drop a pin on the wrong block.
const PRECISE_TYPES = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);
// "Near the area": a home just outside a drawn area is still affected (the drawing is coarse),
// one in another city is a wrong match. 0.01 degrees is about 1 km at Chile's latitudes.
const NEAR_AREA_DEGREES = 0.01;

const geocodeCounter = meter.createCounter("aluvia.worksites.geocode", {
  unit: "{request}",
  description: "Report addresses sent to the Geocoding API, by outcome.",
});

type Bbox = { west: number; south: number; east: number; north: number };

/** Where an emergency is: the bias for the geocoder and the box a result must fall near. */
export type GeocodeBias = { area: Bbox | null; comunas: readonly string[] };

export type GeocodeOutcome = "placed" | "imprecise" | "outside_area" | "not_found" | "failed" | "off";

type GeocodeResponse = {
  status: string;
  results?: { geometry?: { location?: { lat: number; lng: number }; location_type?: string } }[];
};

function isNear(area: Bbox | null, point: { lng: number; lat: number }): boolean {
  if (!area) return true;
  return (
    point.lng >= area.west - NEAR_AREA_DEGREES &&
    point.lng <= area.east + NEAR_AREA_DEGREES &&
    point.lat >= area.south - NEAR_AREA_DEGREES &&
    point.lat <= area.north + NEAR_AREA_DEGREES
  );
}

function requestUrl(address: string, bias: GeocodeBias, key: string): string {
  const params = new URLSearchParams({ address, region: "cl", language: "es", key });
  // locality only biases (it does not filter) and takes one value, so it goes in for a single comuna.
  const components = ["country:CL", ...(bias.comunas.length === 1 ? [`locality:${bias.comunas[0]}`] : [])];
  params.set("components", components.join("|"));
  if (bias.area) {
    const { south, west, north, east } = bias.area;
    params.set("bounds", `${south},${west}|${north},${east}`);
  }
  return `${GEOCODE_URL}?${params.toString()}`;
}

/**
 * The point of a written address in Chile, or null with the reason. Only a precise result
 * (PRECISE_TYPES) near the emergency's area counts; everything else, including a timeout, a
 * provider error or a missing GOOGLE_MAPS_SERVER_KEY, is null so the caller saves the report
 * without a point for a coordinator to place. Never throws and never logs the address.
 */
export async function geocodeAddress(
  address: string,
  bias: GeocodeBias,
): Promise<{ point: { lng: number; lat: number } | null; outcome: GeocodeOutcome }> {
  const key = env.GOOGLE_MAPS_SERVER_KEY;
  const done = (point: { lng: number; lat: number } | null, outcome: GeocodeOutcome) => {
    geocodeCounter.add(1, { outcome });
    return { point, outcome };
  };
  if (!key) return done(null, "off");

  let body: GeocodeResponse;
  try {
    const response = await fetch(requestUrl(address, bias, key), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      logWarn("geocode_request_failed", { status: response.status });
      return done(null, "failed");
    }
    body = (await response.json()) as GeocodeResponse;
  } catch (error) {
    // The URL carries the address and the key: only the error's kind goes to the log.
    logWarn("geocode_request_failed", { error: error instanceof Error ? error.name : "unknown" });
    return done(null, "failed");
  }

  if (body.status === "ZERO_RESULTS") return done(null, "not_found");
  if (body.status !== "OK") {
    logWarn("geocode_request_failed", { providerStatus: body.status });
    return done(null, "failed");
  }
  const geometry = body.results?.[0]?.geometry;
  const location = geometry?.location;
  if (!location || !PRECISE_TYPES.has(geometry.location_type ?? "")) return done(null, "imprecise");
  const point = { lng: location.lng, lat: location.lat };
  if (!isNear(bias.area, point)) return done(null, "outside_area");
  return done(point, "placed");
}
