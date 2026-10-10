"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";

import { useRouter } from "@/shared/i18n/navigation";
import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Card, Field, Input } from "@/shared/ui";

import { createDisasterTypeAction, updateDisasterTypeAction } from "../server/actions";
import { FormStatus } from "./form-status";
import { LocalizedNameFields } from "./localized-name-fields";
import { SubmitButton } from "./submit-button";
import { TemplateEditor, useTemplateRows } from "./template-editor";
import { useAdminAction } from "./use-admin-action";

type DisasterTypeFormProps = {
  /** Present when editing: the stored type and the version it was read at. */
  initial?: {
    key: string;
    name: Record<string, string>;
    version: number;
    workTypes: { key: string; name: Record<string, string> }[];
    supplyTypes: { key: string; name: Record<string, string> }[];
  };
};

/** Creates a disaster type, or renames one and edits its work and supply templates as a whole. */
export function DisasterTypeForm({ initial }: DisasterTypeFormProps) {
  const t = useTranslations("admin.disasterTypes");
  const router = useRouter();
  const create = useAdminAction(createDisasterTypeAction);
  const update = useAdminAction(updateDisasterTypeAction);
  const { pending, result, fieldError, formError, isStale } = initial ? update : create;

  const [key, setKey] = useState(initial?.key ?? "");
  const [name, setName] = useState(initial?.name ?? {});
  const [version, setVersion] = useState(initial?.version ?? 0);
  const work = useTemplateRows(initial?.workTypes ?? [{ key: "", name: {} }]);
  const supplies = useTemplateRows(initial?.supplyTypes ?? []);

  // A newer version from the server that is not our own save (Reload after stale_version):
  // replace what is on screen with it and drop the error.
  const [seenVersion, setSeenVersion] = useState(initial?.version ?? 0);
  if (initial && initial.version !== seenVersion) {
    setSeenVersion(initial.version);
    if (initial.version !== version) {
      setVersion(initial.version);
      setName(initial.name);
      work.replace(initial.workTypes);
      supplies.replace(initial.supplyTypes);
      update.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const templates = { workTypes: work.items, supplyTypes: supplies.items };
    if (initial) {
      update.submit({ key, version, name, ...templates }, (data) => {
        setVersion(data.version);
        router.refresh();
      });
    } else {
      create.submit({ key, name, ...templates }, (data) => router.push(`/admin/disaster-types/${data.key}`));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
      <Card className="gap-4">
        <Field id="disaster-type-key" label={t("keyLabel")} hint={t("keyHint")} error={fieldError("key")}>
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            disabled={Boolean(initial)}
            required
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <LocalizedNameFields
          idPrefix="disaster-type-name"
          value={name}
          onChange={setName}
          requiredLocale={DEFAULT_LOCALE}
          error={fieldError("name")}
        />
      </Card>

      <TemplateEditor
        path="workTypes"
        title={t("templateTitle")}
        lead={t("templateLead")}
        itemTitle={(number) => t("workTypeTitle", { number })}
        addLabel={t("addWorkType")}
        minRows={1}
        template={work}
        fieldError={fieldError}
      />
      <TemplateEditor
        path="supplyTypes"
        title={t("supplyTemplateTitle")}
        lead={t("supplyTemplateLead")}
        itemTitle={(number) => t("supplyTypeTitle", { number })}
        addLabel={t("addSupplyType")}
        minRows={0}
        template={supplies}
        fieldError={fieldError}
      />

      <div className="flex flex-col gap-3">
        <SubmitButton pending={pending}>{initial ? t("save") : t("create")}</SubmitButton>
        <FormStatus error={formError} isStale={isStale} saved={Boolean(initial) && result?.ok === true} />
      </div>
    </form>
  );
}
