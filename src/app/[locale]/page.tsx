import { ArrowUpRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button, Logo, ThemeSwitcher } from "@/shared/ui";

const SOURCE_URL = "https://github.com/srdanirz/Aluvia";

export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-6 px-4 py-16 md:px-8">
      <Logo className="h-10" />
      <p className="text-caption font-medium tracking-label text-ink-muted uppercase">{t("eyebrow")}</p>
      <h1 className="max-w-prose text-heading text-balance text-ink md:text-display">{t("title")}</h1>
      <p className="max-w-prose text-subheading text-ink-soft">{t("lead")}</p>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" asChild>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t("source")}
            <ArrowUpRight aria-hidden size={18} strokeWidth={1.5} />
          </a>
        </Button>
        <ThemeSwitcher />
      </div>
    </main>
  );
}
