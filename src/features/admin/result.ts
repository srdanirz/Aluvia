/**
 * What every admin operation returns. Failures carry a code the client translates
 * (`errors.<code>`), never a sentence; `fieldErrors` maps a field path to its code.
 */
export type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; fieldErrors?: Record<string, string> };
