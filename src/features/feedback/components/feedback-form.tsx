"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { Button, Field, FormError, Input, SegmentedControl, Spinner, Textarea } from "@/shared/ui";

import {
  FEEDBACK_CATEGORIES,
  type FeedbackCategory,
  type FeedbackState,
  MAX_FEEDBACK_CONTACT,
  MAX_FEEDBACK_MESSAGE,
} from "../schemas";

type FeedbackFormProps = {
  action: (state: FeedbackState, formData: FormData) => Promise<FeedbackState>;
};

/**
 * Category, message and an optional way to reply. Fields are controlled so a refused or failed
 * send keeps what the person wrote; a sent one is replaced by the thanks.
 */
export function FeedbackForm({ action }: FeedbackFormProps) {
  const t = useTranslations("feedback.form");
  const errorMessage = useErrorMessage();
  const [category, setCategory] = useState<FeedbackCategory>("problem");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [state, dispatch, pending] = useActionState<FeedbackState, FormData>(async (previous, formData) => {
    formData.set("category", category);
    try {
      return await action(previous, formData);
    } catch {
      // The request never reached the server or its answer never came back.
      return { ok: false, code: "network_error" };
    }
  }, null);

  if (state?.ok) {
    return (
      <div role="status" className="flex animate-enter flex-col gap-2">
        <h2 className="text-subheading text-ink">{t("sentTitle")}</h2>
        <p className="text-body text-ink-soft">{t("sentBody")}</p>
      </div>
    );
  }

  const fieldError = (field: "message" | "contact") =>
    state && !state.ok && state.field === field ? errorMessage(state.code) : undefined;
  const formError = state && !state.ok && !state.field ? errorMessage(state.code) : null;

  return (
    <form action={dispatch} className="flex flex-col gap-6" noValidate>
      <SegmentedControl
        label={t("categoryLabel")}
        options={FEEDBACK_CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) }))}
        value={category}
        onChange={setCategory}
      />
      <Field
        id="feedback-message"
        label={t("messageLabel")}
        hint={t("messageHint", { max: MAX_FEEDBACK_MESSAGE })}
        error={fieldError("message")}
      >
        <Textarea
          name="message"
          rows={3}
          required
          maxLength={MAX_FEEDBACK_MESSAGE}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </Field>
      <Field
        id="feedback-contact"
        label={t("contactLabel")}
        hint={t("contactHint")}
        error={fieldError("contact")}
      >
        <Input
          name="contact"
          maxLength={MAX_FEEDBACK_CONTACT}
          autoComplete="email"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
        />
      </Field>
      {formError ? <FormError size="form">{formError}</FormError> : null}
      <Button type="submit" block disabled={pending || message.trim() === ""}>
        {pending ? <Spinner label={t("sending")} /> : null}
        {t("submit")}
      </Button>
    </form>
  );
}
