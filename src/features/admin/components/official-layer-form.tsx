"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { Card, Chip, Field, Input, SegmentedControl } from "@/shared/ui";

import { importOfficialLayerAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { SubmitButton } from "./submit-button";
import { useAdminAction } from "./use-admin-action";

type Kind = "area" | "worksites";

const fieldList = (text: string) =>
  text
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

/**
 * Imports a public ArcGIS layer (issue #44): its polygons as the area, or its parcels as homes
 * that are affected and waiting for no one. The admin maps which attributes hold the address.
 */
export function OfficialLayerForm({ emergencyId }: { emergencyId: string }) {
  const t = useTranslations("admin.emergencies");
  const router = useRouter();
  const { pending, result, submit, fieldError, formError } = useAdminAction(importOfficialLayerAction);
  const [kind, setKind] = useState<Kind>("worksites");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (field: string) => String(form.get(field) ?? "");
    const layerUrl = text("layerUrl").trim();
    submit(
      kind === "area"
        ? { kind, emergencyId, layerUrl }
        : {
            kind,
            emergencyId,
            layerUrl,
            addressFields: fieldList(text("addressFields")),
            notesFields: fieldList(text("notesFields")),
          },
      () => router.refresh(),
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Card className="gap-4">
        <SegmentedControl
          label={t("layerKindLabel")}
          value={kind}
          onChange={setKind}
          options={[
            { value: "worksites", label: t("layerKindWorksites") },
            { value: "area", label: t("layerKindArea") },
          ]}
        />
        <Field
          id="layer-url"
          label={t("layerUrlLabel")}
          hint={t("layerUrlHint")}
          error={fieldError("layerUrl")}
        >
          <Input name="layerUrl" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} />
        </Field>
        {kind === "worksites" ? (
          <>
            <Field
              id="layer-address-fields"
              label={t("layerAddressLabel")}
              hint={t("layerAddressHint")}
              error={fieldError("addressFields")}
            >
              <Input name="addressFields" autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field
              id="layer-notes-fields"
              label={t("layerNotesLabel")}
              hint={t("layerNotesHint")}
              error={fieldError("notesFields")}
            >
              <Input name="notesFields" autoCapitalize="none" spellCheck={false} />
            </Field>
          </>
        ) : null}
      </Card>
      <div className="flex flex-col gap-3">
        <SubmitButton pending={pending} variant="secondary">
          {t("layerSubmit")}
        </SubmitButton>
        <FormStatus error={formError} />
        {result?.ok ? (
          <p role="status">
            <Chip tone="done">
              {t("layerImported", { features: result.data.featureCount, created: result.data.createdCount })}
            </Chip>
          </p>
        ) : null}
      </div>
    </form>
  );
}
