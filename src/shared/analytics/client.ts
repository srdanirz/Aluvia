import type { EventName, EventProps } from "./events";

// TODO(#23): stub of feat/observability's client tracker (PostHog), same signature.
export function track<N extends EventName>(name: N, props: EventProps<N>): void {
  void name;
  void props;
}
