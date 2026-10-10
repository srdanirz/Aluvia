"use client";

import type { ReactElement } from "react";

import { Link, usePathname } from "@/shared/i18n/navigation";

import { cn } from "./cn";
import { indicatorClassName, indicatorItemClassName, useSlidingIndicator } from "./use-sliding-indicator";

export type FloatingNavItem = {
  href: string;
  label: string;
  /** A rendered Lucide icon (`<House />`); size and stroke come from the nav. */
  icon: ReactElement;
};

/**
 * The app's only navigation bar: a borderless glass pill that floats over the content.
 * Phone: bottom, icons only (labels stay as accessible names). Tablet and up: top, icon and label.
 * Render it outside <main>; the page reserves room with `pb-nav-bottom md:pb-16 md:pt-nav-top`.
 */
export function FloatingNav({ items, label }: { items: FloatingNavItem[]; label: string }) {
  const pathname = usePathname();
  const { containerRef, indicatorRef } = useSlidingIndicator<HTMLUListElement, HTMLLIElement>(pathname);

  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-0 z-50 flex justify-center px-4",
        "bottom-[calc(16px+env(safe-area-inset-bottom))] md:top-[calc(16px+env(safe-area-inset-top))] md:bottom-auto",
      )}
    >
      <ul
        ref={containerRef}
        className="group glass-wash relative flex items-center gap-1 rounded-full bg-glass p-1 shadow-float backdrop-blur-glass"
      >
        <li ref={indicatorRef} aria-hidden className={indicatorClassName} />
        {items.map(({ href, label: itemLabel, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={itemLabel}
                aria-current={active ? "page" : undefined}
                data-active={active}
                className={cn(
                  "press flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-body-sm text-ink-soft hover:text-ink md:px-4",
                  indicatorItemClassName,
                )}
              >
                <span aria-hidden className="flex [&>svg]:size-icon [&>svg]:stroke-[1.5]">
                  {icon}
                </span>
                <span className="hidden md:inline">{itemLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
