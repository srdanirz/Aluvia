"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

import { cn } from "./cn";
import { handleRadioKeys } from "./radio-keys";
import { indicatorClassName, indicatorItemClassName, useSlidingIndicator } from "./use-sliding-indicator";
import { THEME_COOKIE, THEMES, type Theme } from "./theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function readTheme(): Theme {
  const stamped = document.documentElement.dataset.theme;
  return stamped === "light" || stamped === "dark" ? stamped : "system";
}

// The stamp on <html> is the source of truth (ThemeScript sets it before paint).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    delete root.dataset.theme;
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } else {
    root.dataset.theme = theme;
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  }
}

export function ThemeSwitcher({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as const);
  const { containerRef, indicatorRef } = useSlidingIndicator<HTMLDivElement, HTMLSpanElement>(theme);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={t("label")}
      className={cn(
        "group glass-wash relative inline-flex w-fit gap-1 rounded-full bg-glass p-1 shadow-card backdrop-blur-glass",
        className,
      )}
    >
      <span ref={indicatorRef} aria-hidden className={indicatorClassName} />
      {THEMES.map((option) => {
        const Icon = ICONS[option];
        const selected = theme === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            data-active={selected}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(event) => handleRadioKeys(event, THEMES, theme, applyTheme)}
            aria-label={t(option)}
            title={t(option)}
            onClick={() => applyTheme(option)}
            className={cn(
              "press inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:text-ink",
              indicatorItemClassName,
            )}
          >
            <Icon aria-hidden size={18} strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
