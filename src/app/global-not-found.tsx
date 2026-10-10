import type { Metadata } from "next";
import Link from "next/link";

import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Button, ThemeScript } from "@/shared/ui";
import { fontVariables } from "@/shared/ui/fonts";
import "@/shared/ui/theme.css";

import messages from "../../messages/es.json";

// Unmatched URLs never reach [locale], so there is no negotiated locale: the default one speaks.
const t = messages.notFound;

export const metadata: Metadata = { title: t.title };

export default function GlobalNotFound() {
  return (
    <html lang={DEFAULT_LOCALE} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh bg-canvas text-ink">
        <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-6 px-4 py-16 md:px-8">
          <h1 className="font-display text-heading text-ink-strong">{t.title}</h1>
          <p className="max-w-prose text-body text-ink-soft">{t.body}</p>
          <div>
            <Button variant="secondary" asChild>
              <Link href="/">{t.back}</Link>
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
