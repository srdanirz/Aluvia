"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DEFAULT_LOCALE } from "@/shared/i18n/locales";
import { Button, ButtonGroup, Card, Field, FormError, IconButton, Input, Section } from "@/shared/ui";

import { LocalizedNameFields } from "./localized-name-fields";

type TemplateItem = { key: string; name: Record<string, string> };
// rowId keeps React state and field ids attached to a row while rows move. A counter, not a
// random id, so the server render and hydration agree.
type TemplateRow = TemplateItem & { rowId: number };

/** The rows of one template (work types or supplies) and the edits on them. */
export function useTemplateRows(initial: TemplateItem[]) {
  const [rows, setRows] = useState<TemplateRow[]>(() => initial.map((item, rowId) => ({ ...item, rowId })));
  const [nextRowId, setNextRowId] = useState(initial.length);

  return {
    rows,
    items: rows.map(({ key, name }) => ({ key, name })),
    add() {
      setRows((current) => [...current, { rowId: nextRowId, key: "", name: {} }]);
      setNextRowId(nextRowId + 1);
    },
    update(index: number, change: Partial<TemplateItem>) {
      setRows((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));
    },
    move(index: number, by: -1 | 1) {
      setRows((current) => {
        const next = [...current];
        const [row] = next.splice(index, 1);
        if (row) next.splice(index + by, 0, row);
        return next;
      });
    },
    remove(index: number) {
      setRows((current) => current.filter((_, i) => i !== index));
    },
    /** Replaces every row, for when a newer version arrives from the server. Call during render. */
    replace(items: TemplateItem[]) {
      setRows(items.map((item, i) => ({ ...item, rowId: nextRowId + i })));
      setNextRowId(nextRowId + items.length);
    },
  };
}

type TemplateEditorProps = {
  /** Field path in the form's errors and prefix of the ids: `workTypes` or `supplyTypes`. */
  path: string;
  title: string;
  lead: string;
  itemTitle: (number: number) => string;
  addLabel: string;
  /** Rows that cannot be removed below this count. */
  minRows: number;
  template: ReturnType<typeof useTemplateRows>;
  fieldError: (path: string, options?: { includeItems?: boolean }) => string | undefined;
};

/** Edits one ordered template: a key and a name per language for each row; add, reorder, remove. */
export function TemplateEditor({
  path,
  title,
  lead,
  itemTitle,
  addLabel,
  minRows,
  template,
  fieldError,
}: TemplateEditorProps) {
  const t = useTranslations("admin.disasterTypes");
  const listError = fieldError(path, { includeItems: false });
  const { rows } = template;

  return (
    <Section titleId={`${path}-title`} title={title} lead={lead}>
      {listError ? <FormError size="field">{listError}</FormError> : null}
      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const number = index + 1;
          return (
            <li key={row.rowId}>
              <Card className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-body font-medium text-ink">{itemTitle(number)}</h3>
                  <ButtonGroup label={t("rowActions", { title: itemTitle(number) })}>
                    <IconButton
                      variant="ghost"
                      label={t("moveUp")}
                      disabled={index === 0}
                      onClick={() => template.move(index, -1)}
                    >
                      <ArrowUp />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      label={t("moveDown")}
                      disabled={index === rows.length - 1}
                      onClick={() => template.move(index, 1)}
                    >
                      <ArrowDown />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      label={t("remove")}
                      disabled={rows.length <= minRows}
                      onClick={() => template.remove(index)}
                    >
                      <Trash2 />
                    </IconButton>
                  </ButtonGroup>
                </div>
                <Field
                  id={`${path}-${row.rowId}-key`}
                  label={t("itemKey")}
                  hint={t("itemKeyHint")}
                  error={fieldError(`${path}.${index}.key`)}
                >
                  <Input
                    value={row.key}
                    onChange={(event) => template.update(index, { key: event.target.value })}
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <LocalizedNameFields
                  idPrefix={`${path}-${row.rowId}-name`}
                  value={row.name}
                  onChange={(value) => template.update(index, { name: value })}
                  requiredLocale={DEFAULT_LOCALE}
                  error={fieldError(`${path}.${index}.name`)}
                />
              </Card>
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" className="self-start" onClick={template.add}>
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </Section>
  );
}
