import "server-only";

import { z } from "zod";

// Server configuration, validated once at import. A missing or malformed value fails at
// startup with the variable's name, never mid-request.

// `next build` runs with NODE_ENV=production but without the runtime secrets; it only needs to
// import modules, so "required in production" is enforced when the server starts, not at build.
const requiredInProduction = (value: unknown) =>
  value !== undefined ||
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PHASE === "phase-production-build";

const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
  // Keys rate-limit counters by an HMAC of the client IP, so the table never holds an IP.
  // Required in production; dev and tests get a fixed local value.
  RATE_LIMIT_SECRET: z
    .string()
    .min(32)
    .optional()
    .refine(requiredInProduction, "required in production")
    .transform((value) => value ?? "local-development-rate-limit-secret"),
  // Proxies that append to X-Forwarded-For: 1 on Cloud Run alone, 2 behind the external load balancer.
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
  // Batch import reads pasted text with Claude; without a key the batch screen says it is off.
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\nSee .env.example.`);
}

export const env = parsed.data;
