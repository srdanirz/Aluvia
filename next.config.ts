import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { z } from "zod";

import { publicEnv } from "./src/shared/public-env";

// The NEXT_PUBLIC_ variables are inlined in the bundle, so they are validated here, at build.
const publicEnvCheck = z
  .object({
    NEXT_PUBLIC_SENTRY_DSN: z.url({ protocol: /^https?$/ }).optional(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url({ protocol: /^https?$/ }),
  })
  .safeParse(publicEnv);
if (!publicEnvCheck.success) {
  const issues = publicEnvCheck.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid public environment:\n${issues.join("\n")}\nSee .env.example.`);
}

const nextConfig: NextConfig = {
  // The generated AGENTS.md block breaks our no-em-dash rule; AGENTS.md carries the same advice.
  agentRules: false,
  cacheComponents: true,
  // The root layout sits under [locale], so unmatched URLs need their own document.
  experimental: { globalNotFound: true },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Sentry's build step injects the release and, when SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT are set (CI only), uploads source maps so browser stack traces are readable,
// then deletes them. Without a token it must not generate them: with Turbopack it would turn on
// productionBrowserSourceMaps and a fork would serve its .map files publicly.
export default withSentryConfig(createNextIntlPlugin("./src/shared/i18n/request.ts")(nextConfig), {
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  routeManifestInjection: false,
  // We do not trace in the browser (ADR 0008), so the router-transition hook is unused.
  suppressOnRouterTransitionStartWarning: true,
  // Errors only: no build-time instrumentation of server code, no tracing in the bundle.
  buildTimeInstrumentation: false,
  bundleSizeOptimizations: {
    excludeTracing: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
