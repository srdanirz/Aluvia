import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

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

export default createNextIntlPlugin("./src/shared/i18n/request.ts")(nextConfig);
