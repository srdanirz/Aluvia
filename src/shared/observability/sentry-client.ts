import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./sentry";

/** Loaded by instrumentation-client.ts in its own chunk, only when a DSN is configured. */
export function startSentry(dsn: string): void {
  Sentry.init(sentryOptions(dsn));
}
