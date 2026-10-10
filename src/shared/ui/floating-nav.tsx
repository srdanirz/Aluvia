"use client";

import type { ReactElement } from "react";

import { Link, usePathname } from "@/shared/i18n/navigation";

import { cn } from "./cn";

export type FloatingNavItem = {
  href: string;
  label: string;
  /** A rendered Lucide icon (`<House />`); size and stroke come from the nav. */
  icon: ReactElement;
};

/**
 * The app's only navigation bar: a bordered glass pill that floats over the content.
 * Phone: bottom, icons only (labels stay as accessible names). Tablet and up: top, icon and label.
 * Render it outside <main>; the page reserves room with `pb-nav-bottom md:pb-16 md:pt-nav-top`.
 */
export function FloatingNav({ items, label }: { items: FloatingNavItem[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label={label}
      className={cn(
        "fixed inset-x-0 z-50 flex justify-center px-4",
        "bottom-[calc(16px+env(safe-area-inset-bottom))] md:top-[calc(16px+env(safe-area-inset-top))] md:bottom-auto",
      )}
    >
      <ul className="flex items-center gap-1 rounded-full border border-glass-line bg-glass p-1 shadow-float backdrop-blur-glass">
        {items.map(({ href, label: itemLabel, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-label={itemLabel}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-body-sm text-ink-muted transition-colors hover:text-ink md:px-4",
                  active && "bg-surface-muted text-ink",
                )}
              >
                <span aria-hidden className="flex [&>svg]:size-[22px] [&>svg]:stroke-[1.5]">
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
