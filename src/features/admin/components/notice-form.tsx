"use client";

import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { languageNames } from "@/shared/i18n/language-names";
import { LOCALES } from "@/shared/i18n/locales";
import { useRouter } from "@/shared/i18n/navigation";
import { Button, Card, Field, Textarea } from "@/shared/ui";

import { publishNoticeAction, withdrawNoticeAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { SubmitButton } from "./submit-button";
import { useAdminAction } from "./use-admin-action";

type NoticeFormProps = {
  emergencyId: string;
  defaultLocale: string;
  notice: { id: string; message: Record<string, string>; publishedLabel: string } | null;
};

/** The official notice over the map and the report: publish, replace or withdraw it. */
export function NoticeForm({ emergencyId, defaultLocale, notice }: NoticeFormProps) {
  const t = useTranslations("admin.emergencies");
  const languageOf = languageNames(useLocale());
  const router = useRouter();
  const publish = useAdminAction(publishNoticeAction);
  const withdraw = useAdminAction(withdrawNoticeAction);
  const [message, setMessage] = useState<Record<string, string>>(notice?.message ?? {});
  const [seenNoticeId, setSeenNoticeId] = useState(notice?.id ?? null);
  // The notice changed on the server (ours or someone else's): show it and drop old errors.
  if ((notice?.id ?? null) !== seenNoticeId) {
    setSeenNoticeId(notice?.id ?? null);
    setMessage(notice?.message ?? {});
    withdraw.reset();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    publish.submit({ emergencyId, replacesId: notice?.id ?? null, message }, () => router.refresh());
  }

  const error = publish.formError ?? withdraw.formError;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="gap-4">
        {notice ? <p className="text-caption text-ink-muted">{notice.publishedLabel}</p> : null}
        {LOCALES.map((locale) => (
          <Field
            key={locale}
            id={`notice-${locale}`}
            label={t("noticeIn", { language: languageOf(locale) })}
            hint={locale === defaultLocale ? t("noticeHint") : undefined}
            error={locale === defaultLocale ? publish.fieldError("message") : undefined}
          >
            <Textarea
              lang={locale}
              rows={3}
              value={message[locale] ?? ""}
              onChange={(event) => setMessage({ ...message, [locale]: event.target.value })}
            />
          </Field>
        ))}
      </Card>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={publish.pending}>
          {notice ? t("noticeReplace") : t("noticePublish")}
        </SubmitButton>
        {notice ? (
          <Button
            variant="secondary"
            disabled={withdraw.pending}
            onClick={() => withdraw.submit({ emergencyId, noticeId: notice.id }, () => router.refresh())}
          >
            {t("noticeWithdraw")}
          </Button>
        ) : null}
      </div>
      <FormStatus
        error={error}
        isStale={publish.isStale || withdraw.isStale}
        saved={publish.result?.ok === true && Boolean(notice)}
      />
    </form>
  );
}
