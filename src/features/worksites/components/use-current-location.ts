"use client";

import { useCallback, useEffect, useState } from "react";

import { PRECISE_LOCATION_METERS } from "../schemas";

export type LocationState =
  | { status: "locating" }
  | { status: "ready"; lng: number; lat: number; accuracyMeters: number }
  /** A fix too coarse to find the home by (PRECISE_LOCATION_METERS): kept, but the address is asked too. */
  | { status: "approximate"; lng: number; lat: number; accuracyMeters: number }
  | { status: "denied" }
  | { status: "unavailable" };

// A GPS fix indoors can take a while; past this the form falls back to the written address.
const TIMEOUT_MS = 15_000;
// A fix from the last minute is the same house; reusing it saves the wait on a retry.
const MAX_AGE_MS = 60_000;

/** Asks for the phone's position as soon as the form opens, so the location is prefilled. */
export function useCurrentLocation(): { location: LocationState; retry: () => void } {
  const [location, setLocation] = useState<LocationState>({ status: "locating" });

  // Results arrive in callbacks, so the effect never sets state synchronously.
  const request = useCallback(() => {
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setLocation({ status: "unavailable" }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const accuracyMeters = Math.round(position.coords.accuracy);
        setLocation({
          status: accuracyMeters > PRECISE_LOCATION_METERS ? "approximate" : "ready",
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          accuracyMeters,
        });
      },
      (error) => setLocation({ status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: MAX_AGE_MS },
    );
  }, []);

  useEffect(request, [request]);

  const retry = useCallback(() => {
    setLocation({ status: "locating" });
    request();
  }, [request]);

  return { location, retry };
}
