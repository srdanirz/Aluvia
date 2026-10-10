import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";
import type { ReactNode } from "react";

import { routing } from "@/shared/i18n/routing";
import { Aurora, ThemeScript } from "@/shared/ui";
import { fontVariables } from "@/shared/ui/fonts";
import "@/shared/ui/theme.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await rootParams.locale();
  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh text-ink">
        <Aurora />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
