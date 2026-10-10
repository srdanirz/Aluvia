// Google loads the script but draws no tiles when the daily quota is spent or the network drops
// mid-load, and no loading status says so. Twelve visible seconds is far past a slow 3G tile load.
export const TILES_TIMEOUT_MS = 12_000;

/** Whether the page is on screen, and a way to hear when that changes. */
export type Visibility = { isVisible: () => boolean; subscribe: (onChange: () => void) => () => void };

const documentVisibility: Visibility = {
  isVisible: () => document.visibilityState === "visible",
  subscribe: (onChange) => {
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  },
};

/**
 * Calls `onTimeout` if `loaded()` is not called within `ms` of uninterrupted visibility: how the
 * map learns it has no tiles (ADR 0006: then the list view takes over). Browsers draw no tiles in
 * a hidden tab, so hiding the page restarts the clock; a link opened in a background tab must not
 * fall back to the list. `cancel()` on unmount.
 */
export function startTilesWatchdog(
  onTimeout: () => void,
  ms = TILES_TIMEOUT_MS,
  visibility = documentVisibility,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let done = false;

  const sync = () => {
    if (done) return;
    if (visibility.isVisible() && timer === undefined) {
      timer = setTimeout(() => {
        stop();
        onTimeout();
      }, ms);
    } else if (!visibility.isVisible() && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const unsubscribe = visibility.subscribe(sync);
  const stop = () => {
    done = true;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    unsubscribe();
  };

  sync();
  return { loaded: stop, cancel: stop };
}
