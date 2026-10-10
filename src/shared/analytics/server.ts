import "server-only";

import type { EventName, EventProps } from "./events";

// TODO(#23): stub of feat/observability's server tracker, same signature. Call it after the
// commit; it never blocks the response.
export function trackServerEvent<N extends EventName>(
  name: N,
  props: EventProps<N>,
  options?: { distinctId?: string },
): void {
  void name;
  void props;
  void options;
}
