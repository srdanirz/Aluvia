import { getFormatter, getTranslations } from "next-intl/server";

import { LoadMore, PageHeader } from "@/features/admin";
import { loadFeedbackList } from "@/features/feedback";
import { Card, CardBody, Chip } from "@/shared/ui";

export default async function AdminFeedbackPage({ searchParams }: PageProps<"/[locale]/admin/feedback">) {
  const { after } = await searchParams;
  const [page, t, format] = await Promise.all([
    loadFeedbackList(after),
    getTranslations("admin.feedback"),
    getFormatter(),
  ]);

  return (
    <div className="flex animate-enter flex-col gap-12">
      <PageHeader title={t("title")} lead={t("lead")} />
      {page.items.length === 0 ? (
        <p className="text-body text-ink-soft">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Chip tone={item.category === "problem" ? "urgent" : "neutral"}>
                    {t(`categories.${item.category}`)}
                  </Chip>
                  <p className="text-caption text-ink-muted">
                    {format.dateTime(item.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                    {item.emergencySlug ? ` · ${item.emergencySlug}` : null}
                  </p>
                </div>
                <CardBody className="whitespace-pre-line text-ink">{item.message}</CardBody>
                {item.contact ? (
                  <p className="text-body-sm text-ink-soft">{t("contact", { contact: item.contact })}</p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <LoadMore pathname="/admin/feedback" cursor={page.nextCursor} />
    </div>
  );
}
