"use client";

import { useEffect } from "react";

import { flushOutbox } from "./outbox";

// Retry cadence while something is pending; the online event usually beats it.
const RETRY_MS = 30_000;

/** Sends queued writes when the app opens, when the signal comes back and every half minute. Renders nothing. */
export function OutboxSync() {
  useEffect(() => {
    const flush = () => void flushOutbox();
    flush();
    window.addEventListener("online", flush);
    const timer = window.setInterval(flush, RETRY_MS);
    return () => {
      window.removeEventListener("online", flush);
      window.clearInterval(timer);
    };
  }, []);
  return null;
}
