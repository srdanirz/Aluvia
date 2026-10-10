"use client";

import { useState, useTransition } from "react";

import { useErrorMessage } from "@/shared/i18n/use-error-message";

type Outcome = { ok: true } | { ok: false; code: string };

/**
 * Runs one Server Action from a button: pending state, and the server's code translated when it
 * refuses. A failed request (no signal) reads as network_error and the person taps again: claims
 * are never queued offline, a late claim would fight whoever took the home meanwhile.
 */
export function useAction() {
  const errorMessage = useErrorMessage();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<Outcome>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      let result: Outcome;
      try {
        result = await action();
      } catch {
        // The request never reached the server or its answer never came back.
        result = { ok: false, code: "network_error" };
      }
      if (result.ok) onDone?.();
      else setError(errorMessage(result.code));
    });
  };

  return { run, isPending, error };
}
