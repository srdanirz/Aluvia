import "server-only";

import { z } from "zod";

// An empty value in .env means "off", same as leaving the line out.
const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), type.optional());

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
  // Port for the Prometheus scrape endpoint (ADR 0008). Unset: no metrics server.
  METRICS_PORT: optional(z.coerce.number().int().min(1).max(65_535)),
  // Lets Cloud Logging join each log line to its trace. Unset: logs carry the bare trace id.
  GOOGLE_CLOUD_PROJECT: optional(z.string().min(1)),
  // Development only: browse the admin as this user until sign-in exists (#16).
  DEV_ADMIN_USER_ID: z.uuid().optional(),
  // Cloud SQL IAM authentication: the password is the runtime service account's access token,
  // fetched from the GCP metadata server. Production only (ADR 0012).
  DATABASE_IAM_AUTH: z.stringbool().default(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\nSee .env.example.`);
}

if (parsed.data.DEV_ADMIN_USER_ID && process.env.NODE_ENV === "production") {
  throw new Error("DEV_ADMIN_USER_ID is for development only; unset it in production.");
}

export const env = parsed.data;
