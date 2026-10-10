import { getTranslations } from "next-intl/server";

import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <main className="mx-auto flex min-h-dvh max-w-content flex-col justify-center gap-6 px-4 py-16 md:px-8">
      <h1 className="text-heading text-ink">{t("title")}</h1>
      <p className="max-w-prose text-body text-ink-soft">{t("body")}</p>
      <div>
        <Button variant="secondary" asChild>
          <Link href="/">{t("back")}</Link>
        </Button>
      </div>
    </main>
  );
}
