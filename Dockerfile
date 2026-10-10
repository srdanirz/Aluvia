# Production image for Cloud Run (ADR 0012). Three targets from one build:
#   app      Next standalone server, the service "aluvia"
#   migrate  drizzle migrations, the job "aluvia-migrate"
#   task     the repo's one-off scripts (pnpm db:seed, pnpm admin:grant), the job "aluvia-task"
# Pinned by digest; bump it on purpose (node 22 LTS, matches engines in package.json).
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# NEXT_PUBLIC_ values are inlined into the browser bundle at build, so they arrive as build args.
# They are public by design: never pass a secret here.
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG SENTRY_ORG SENTRY_PROJECT
# The build never connects to a database; env.ts only needs a well-formed URL to load. The Sentry
# token uploads source maps; it is a build secret, never an ARG, so no layer keeps it.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null)" \
    DATABASE_URL=postgres://build:build@localhost:5432/build pnpm build

# The migrator needs only drizzle-orm and postgres (neither has dependencies), at the exact
# versions the lockfile resolved for the app.
FROM deps AS migrate-deps
RUN mkdir /migrate && cd /migrate && npm init -y >/dev/null && \
    npm install --ignore-scripts --no-audit --no-fund \
      "drizzle-orm@$(node -p "require('/app/node_modules/drizzle-orm/package.json').version")" \
      "postgres@$(node -p "require('/app/node_modules/postgres/package.json').version")"

FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS migrate
WORKDIR /app
COPY --from=migrate-deps /migrate/node_modules ./node_modules
COPY drizzle ./drizzle
COPY scripts/migrate.mjs ./scripts/
USER node
CMD ["node", "scripts/migrate.mjs"]

# Full source and dev dependencies, because the scripts run with tsx and import src/. pnpm is
# fetched at build so a run needs no download; the job passes the script name as args.
FROM deps AS task
ENV COREPACK_HOME=/corepack
COPY . .
RUN pnpm --version >/dev/null && chown -R node:node /corepack
USER node
# Without a script name the run fails instead of listing scripts and passing as a success.
ENTRYPOINT ["sh", "-c", "test -n \"$1\" || { echo 'Usage: --args=<script>[,arg...]' >&2; exit 2; }; exec pnpm run \"$@\"", "task"]

FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392 AS app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
