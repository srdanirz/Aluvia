import { ArrowUpRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { findOpenEmergencies } from "@/features/emergencies/server";
import { Link, redirect } from "@/shared/i18n/navigation";
import { Button, Card, CardTitle, Logo, Page, ThemeSwitcher } from "@/shared/ui";

const SOURCE_URL = "https://github.com/srdanirz/Aluvia";

// With one open emergency the home is its map: nobody should have to pick between one option.
export default async function HomePage() {
  const locale = await getLocale();
  const [emergencies, t] = await Promise.all([findOpenEmergencies(locale), getTranslations("home")]);
  const [only] = emergencies;
  if (emergencies.length === 1 && only) redirect({ href: `/emergencies/${only.slug}`, locale });

  return (
    <Page nav={false} width="content" align="center" className="animate-enter">
      <Logo className="h-10" />
      <p className="text-caption font-medium tracking-label text-ink-muted uppercase">{t("eyebrow")}</p>
      <h1 className="max-w-prose text-heading text-balance text-ink md:text-display">{t("title")}</h1>
      <p className="max-w-prose text-subheading text-ink-soft">{t("lead")}</p>
      {emergencies.length > 1 ? (
        <section aria-label={t("pick")} className="grid gap-4 md:grid-cols-2">
          {emergencies.map((emergency) => (
            <Link key={emergency.slug} href={`/emergencies/${emergency.slug}`} className="block rounded-card">
              <Card interactive>
                <CardTitle>{emergency.name}</CardTitle>
              </Card>
            </Link>
          ))}
        </section>
      ) : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" asChild>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer">
            {t("source")}
            <ArrowUpRight aria-hidden size={18} strokeWidth={1.5} />
          </a>
        </Button>
        <ThemeSwitcher />
      </div>
    </Page>
  );
}
