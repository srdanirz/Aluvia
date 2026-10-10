"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Moves one indicator pill under the active item of a group, so a selection change slides and
 * stretches instead of jumping. The active item must carry `data-active="true"`. Until the
 * indicator is placed (and without JavaScript) the container lacks `data-ready`, and the active
 * item paints its own background.
 */
export function useSlidingIndicator<C extends HTMLElement, I extends HTMLElement>(activeKey: unknown) {
  const containerRef = useRef<C>(null);
  const indicatorRef = useRef<I>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    const active = container?.querySelector<HTMLElement>('[data-active="true"]');
    if (!container || !indicator) return;
    if (!active) {
      delete container.dataset.ready;
      return;
    }
    const place = () => {
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.height = `${active.offsetHeight}px`;
      indicator.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
    };
    if (container.dataset.ready) {
      place();
    } else {
      // First placement lands without animating; only later changes slide and stretch.
      indicator.style.transition = "none";
      place();
      void indicator.offsetWidth;
      indicator.style.transition = "";
      container.dataset.ready = "true";
    }
    const observer = new ResizeObserver(place);
    observer.observe(container);
    observer.observe(active);
    return () => observer.disconnect();
  }, [activeKey]);

  return { containerRef, indicatorRef };
}

/** Classes for the indicator element; it is the first child of the group. Physical `left-0` because offsetLeft and translate are physical, also in RTL. */
export const indicatorClassName =
  "pointer-events-none absolute left-0 top-0 rounded-full bg-action opacity-0 transition-[transform,width,height,opacity] duration-[450ms] ease-spring group-data-[ready]:opacity-100";

/** Classes for an item: it paints its own active background only until the indicator takes over. */
export const indicatorItemClassName =
  "relative z-10 data-[active=true]:bg-action data-[active=true]:text-on-action data-[active=true]:hover:text-on-action data-[active=true]:hover:bg-action group-data-[ready]:data-[active=true]:bg-transparent group-data-[ready]:data-[active=true]:hover:bg-transparent";
