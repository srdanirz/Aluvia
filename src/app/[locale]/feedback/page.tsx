import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { FeedbackForm, sendFeedbackAction } from "@/features/feedback";
import { Link } from "@/shared/i18n/navigation";
import { Button, GlassPanel, Logo, Page, TextLink } from "@/shared/ui";

const REPO_URL = "https://github.com/srdanirz/Aluvia";
const CONTRIBUTING_URL = `${REPO_URL}/blob/main/CONTRIBUTING.md`;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("feedback");
  return { title: t("title") };
}

// `?emergency=<slug>` says which emergency's pages it was sent from; the action resolves it.
export default async function FeedbackPage({ searchParams }: PageProps<"/[locale]/feedback">) {
  const { emergency } = await searchParams;
  const emergencySlug = typeof emergency === "string" && emergency !== "" ? emergency : null;
  const t = await getTranslations("feedback");

  return (
    <Page nav={false} className="animate-enter">
      <div className="flex items-center justify-between gap-4">
        <Logo className="h-8" />
        {emergencySlug ? (
          <Button variant="ghost" size="compact" asChild>
            <Link href={`/emergencies/${encodeURIComponent(emergencySlug)}`}>
              <ArrowLeft aria-hidden />
              {t("back")}
            </Link>
          </Button>
        ) : null}
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-heading text-ink">{t("title")}</h1>
        <p className="text-body text-ink-soft">{t("lead")}</p>
      </header>
      <GlassPanel>
        <FeedbackForm action={sendFeedbackAction.bind(null, { emergencySlug })} />
      </GlassPanel>
      <p className="text-body-sm text-ink-soft">
        {t.rich("developers", {
          repo: (chunks) => (
            <TextLink href={REPO_URL} target="_blank" rel="noreferrer">
              {chunks}
            </TextLink>
          ),
          guide: (chunks) => (
            <TextLink href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">
              {chunks}
            </TextLink>
          ),
        })}
      </p>
    </Page>
  );
}
