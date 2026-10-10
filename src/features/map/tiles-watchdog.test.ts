import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startTilesWatchdog, TILES_TIMEOUT_MS, type Visibility } from "./tiles-watchdog";

/** A page whose visibility the test switches by hand. */
function fakePage(visible: boolean) {
  const listeners = new Set<() => void>();
  const page: Visibility & { show: (next: boolean) => void } = {
    isVisible: () => visible,
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    show: (next) => {
      visible = next;
      listeners.forEach((listener) => listener());
    },
  };
  return page;
}

describe("startTilesWatchdog", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up on the map when no tiles arrive in time (quota spent, no network)", () => {
    const onTimeout = vi.fn();
    startTilesWatchdog(onTimeout, TILES_TIMEOUT_MS, fakePage(true));
    vi.advanceTimersByTime(TILES_TIMEOUT_MS - 1);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("keeps the map once tiles load", () => {
    const onTimeout = vi.fn();
    startTilesWatchdog(onTimeout, TILES_TIMEOUT_MS, fakePage(true)).loaded();
    vi.advanceTimersByTime(TILES_TIMEOUT_MS * 2);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  // Browsers draw no tiles in a hidden tab; a link opened in the background must keep its map.
  it("only counts time while the page is visible", () => {
    const onTimeout = vi.fn();
    const page = fakePage(false);
    startTilesWatchdog(onTimeout, TILES_TIMEOUT_MS, page);
    vi.advanceTimersByTime(TILES_TIMEOUT_MS * 5);
    expect(onTimeout).not.toHaveBeenCalled();
    page.show(true);
    vi.advanceTimersByTime(TILES_TIMEOUT_MS - 1);
    page.show(false);
    vi.advanceTimersByTime(TILES_TIMEOUT_MS);
    expect(onTimeout).not.toHaveBeenCalled();
    page.show(true);
    vi.advanceTimersByTime(TILES_TIMEOUT_MS);
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
