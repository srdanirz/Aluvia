"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button, Field, FormError, Input, Spinner } from "@/shared/ui";

import type { OrganizationActionState } from "../schemas";
import { createOrganizationAction } from "../server/actions";

/** Admin form for a new organization of an emergency: a name and, if it has one, a public contact. */
export function OrganizationForm({ emergencyId }: { emergencyId: string }) {
  const t = useTranslations("organizations.form");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const [state, dispatch, pending] = useActionState<OrganizationActionState, FormData>(
    createOrganizationAction.bind(null, { emergencyId, locale }),
    null,
  );

  return (
    // React resets the form after each submit; a refused one comes back with what was typed.
    <form className="flex flex-col gap-4" action={dispatch}>
      <h3 className="text-subheading font-medium text-ink">{t("title")}</h3>
      <Field id="organization-name" label={t("nameLabel")} hint={t("nameHint")}>
        <Input
          name="name"
          required
          maxLength={120}
          autoComplete="organization"
          defaultValue={state && !state.ok ? state.values.name : ""}
        />
      </Field>
      <Field id="organization-public-contact" label={t("contactLabel")} hint={t("contactHint")}>
        <Input
          name="publicContact"
          maxLength={200}
          defaultValue={state && !state.ok ? state.values.publicContact : ""}
        />
      </Field>
      {state && !state.ok ? <FormError>{tErrors(state.code)}</FormError> : null}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner label={t("create")} /> : null}
          {t("create")}
        </Button>
      </div>
    </form>
  );
}
