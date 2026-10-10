"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, Field, Input, Spinner } from "@/shared/ui";

import type { LoginState } from "../schemas";
import { submitLogin } from "../server/actions";

/** Phone, then the code we sent, then the name the first time. `next` is where it returns. */
export function LoginForm({ next, initialState }: { next: string; initialState: LoginState }) {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const tErrors = useTranslations("errors");
  const [state, action, pending] = useActionState(submitLogin.bind(null, { next, locale }), initialState);
  const error = state.error ? tErrors(state.error) : undefined;
  const submitLabel = { phone: t("sendCode"), code: t("verify"), name: t("continue") }[state.step];

  return (
    <form action={action} className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-heading-sm text-ink">{t(`${state.step}.title`)}</h1>
        <p className="text-body-sm text-ink-soft">
          {state.step === "code" ? t("code.lead", { phone: state.phone }) : t(`${state.step}.lead`)}
        </p>
      </header>

      {state.step === "phone" ? (
        <Field id="login-phone" label={t("phone.label")} hint={t("phone.hint")} error={error}>
          <Input
            key="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            autoFocus
            defaultValue={state.phoneInput}
          />
        </Field>
      ) : null}

      {state.step === "code" ? (
        <Field
          id="login-code"
          label={t("code.label")}
          hint={state.resent ? t("code.resent") : undefined}
          error={error}
        >
          <Input
            key="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
          />
        </Field>
      ) : null}

      {state.step === "name" ? (
        <Field id="login-name" label={t("name.label")} hint={t("name.hint")} error={error}>
          <Input key="name" name="name" autoComplete="name" maxLength={80} required autoFocus />
        </Field>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" name="intent" value="verify" block disabled={pending}>
          {pending ? <Spinner label={t("pending")} /> : null}
          {submitLabel}
        </Button>
        {state.step === "code" ? (
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="submit"
              name="intent"
              value="resend"
              variant="ghost"
              formNoValidate
              disabled={pending}
            >
              {t("code.resend")}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="change"
              variant="ghost"
              formNoValidate
              disabled={pending}
            >
              {t("code.change")}
            </Button>
          </div>
        ) : null}
      </div>
    </form>
  );
}
