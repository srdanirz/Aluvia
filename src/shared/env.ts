import "server-only";

import { z } from "zod";

// An empty value in .env means "off", same as leaving the line out.
const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), type.optional());

// Server configuration, validated once at import. A missing or malformed value fails at
// startup with the variable's name, never mid-request.

// `next build` runs with NODE_ENV=production but without the runtime secrets; it only needs to
// import modules, so "required in production" is enforced when the server starts, not at build.
const isProductionRuntime =
  process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
const requiredInProduction = (value: unknown) => value !== undefined || !isProductionRuntime;

const schema = z
  .object({
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
    // Hosts an admin may import official layers from (issue #44), comma separated; each one also
    // allows its subdomains. Unset: Esri's hosted services only.
    ARCGIS_ALLOWED_HOSTS: z
      .string()
      .optional()
      .transform((value) =>
        (value || "arcgis.com,arcgisonline.com")
          .split(",")
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean),
      ),
    // Cloud SQL IAM authentication: the password is the runtime service account's access token,
    // fetched from the GCP metadata server. Production only (ADR 0012).
    DATABASE_IAM_AUTH: z.stringbool().default(false),
    // Keys the HMAC of login codes and phones (ADR 0013). Rotating it voids pending codes only.
    // Required in production; dev and tests get a fixed local value.
    AUTH_SECRET: z
      .string()
      .min(32)
      .optional()
      .refine(requiredInProduction, "required in production")
      .transform((value) => value ?? "local-development-auth-secret-not-for-production"),
    // ISO 3166 countries whose phones may log in, comma separated; the first is assumed when a
    // number is typed without its prefix. Limiting it keeps SMS pumping abroad from costing money.
    PHONE_REGIONS: z
      .string()
      .optional()
      .refine(requiredInProduction, "required in production")
      .transform((value) => (value ?? "CL").split(",").map((region) => region.trim().toUpperCase()))
      .pipe(z.array(z.string().regex(/^[A-Z]{2}$/)).min(1)),
  })
  // Login codes travel by WhatsApp or SMS (ADR 0013); without either, nobody can log in.
  .refine(
    () =>
      !isProductionRuntime || Boolean(process.env.WHATSAPP_ACCESS_TOKEN || process.env.TWILIO_ACCOUNT_SID),
    {
      path: ["WHATSAPP_ACCESS_TOKEN"],
      message: "login needs WhatsApp or Twilio configured in production",
    },
  );

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\nSee .env.example.`);
}

export const env = parsed.data;
