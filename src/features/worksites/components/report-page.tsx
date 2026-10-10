import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Page } from "@/shared/ui";

/**
 * Frame of the report screens: one narrow column, the emergency as eyebrow, one title, and the
 * reminder that Aluvia never asks for money (fake volunteers do, after every flood).
 */
export async function ReportPage({
  eyebrow,
  title,
  lead,
  notice,
  children,
}: {
  eyebrow: string;
  title: string;
  lead?: string;
  /** The emergency's official notice (`OfficialNotice` from the admin feature), above everything else. */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const t = await getTranslations("worksites.trust");
  return (
    <Page className="animate-enter">
      {notice}
      <header className="flex flex-col gap-3">
        <p className="text-caption font-medium tracking-label text-ink-muted uppercase">{eyebrow}</p>
        <h1 className="text-heading text-balance text-ink">{title}</h1>
        {lead ? <p className="text-body text-ink-soft">{lead}</p> : null}
      </header>
      {children}
      <p className="text-center text-caption text-ink-muted">{t("noMoney")}</p>
    </Page>
  );
}
