import "server-only";

import type { z } from "zod";

/** The error body of every /api/v1 route: a code the client translates, never a sentence (STYLEGUIDE). */
export function errorResponse(status: number, code: string, details?: unknown): Response {
  return Response.json(details === undefined ? { code } : { code, details }, { status });
}

/** Parses a JSON body with a feature schema; a malformed body is the same 422 as an invalid one. */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; response: Response }> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = schema.safeParse(body);
  if (parsed.success) return { ok: true, data: parsed.data };
  // Our refinements carry a code as their message; zod's own issues carry it in `code`.
  const details = parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code === "custom" ? issue.message : issue.code,
  }));
  return { ok: false, response: errorResponse(422, "invalid_body", details) };
}
