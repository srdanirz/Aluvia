import "server-only";

import { z } from "zod";

/**
 * Read on the sweep endpoint's first request, not at import: `next build` imports every route
 * without production values. The scheduler calls every minute, so a bad deploy shows within one.
 */
const schema = z.object({
  // Public origin: the sweep endpoint's URL under it is the audience of the scheduler's OIDC token.
  APP_URL: z.url({ protocol: /^https?$/ }).transform((url) => url.replace(/\/$/, "")),
});

let cached: z.infer<typeof schema> | undefined;

export function getWorkItemsEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid work items environment:\n${issues}\nSee .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
