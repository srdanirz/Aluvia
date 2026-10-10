"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import type { Result } from "../result";

/**
 * Runs an admin Server Action from a form and keeps its last result. A thrown action (a 500,
 * already logged on the server, or no network) becomes the `unexpected` code, so the form
 * keeps what was typed and says it was not saved.
 */
export function useAdminAction<T>(action: (input: unknown) => Promise<Result<T>>) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<Result<T> | null>(null);
  const tErrors = useTranslations("errors");

  function errorText(code: string | undefined) {
    if (!code) return undefined;
    const key = (tErrors.has(code as never) ? code : "unexpected") as Parameters<typeof tErrors>[0];
    return tErrors(key);
  }

  function submit(input: unknown, onSuccess?: (data: T) => void) {
    startTransition(async () => {
      let next: Result<T>;
      try {
        next = await action(input);
      } catch {
        next = { ok: false, code: "unexpected" };
      }
      setResult(next);
      if (next.ok) onSuccess?.(next.data);
    });
  }

  return {
    pending,
    result,
    submit,
    /** Forgets the last result, for when the form is reloaded with someone else's newer version. */
    reset: () => setResult(null),
    /**
     * Translated error of one field by path (`name`, `workTypes.2.key`). With `includeItems`, an
     * error on one of its items (`comunas.3`) counts too; lists that show item errors on each row pass false.
     */
    fieldError: (path: string, { includeItems = true }: { includeItems?: boolean } = {}) => {
      const errors = result && !result.ok ? (result.fieldErrors ?? {}) : {};
      const nested = includeItems ? Object.keys(errors).find((key) => key.startsWith(`${path}.`)) : undefined;
      return errorText(errors[path] ?? (nested ? errors[nested] : undefined));
    },
    formError: result && !result.ok ? errorText(result.code) : undefined,
    isStale: result?.ok === false && result.code === "stale_version",
  };
}
