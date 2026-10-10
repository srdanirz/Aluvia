"use client";

import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { track } from "@/shared/analytics/client";
import { useErrorMessage } from "@/shared/i18n/use-error-message";
import type { Locale } from "@/shared/i18n/locales";
import { usePersistedState } from "@/shared/offline/use-persisted-state";
import {
  Button,
  Card,
  Chip,
  Field,
  FormError,
  IconButton,
  Input,
  Spinner,
  Textarea,
  ToggleTile,
} from "@/shared/ui";

import { extractDrafts, importWorksites } from "../server/actions";

type Draft = {
  id: string;
  addressText: string;
  workTypeKeys: string[];
  hasVulnerablePeople: boolean;
  isPersonInDanger: boolean;
};

const NO_DRAFTS: Draft[] = [];
// Mirrors MAX_BATCH_TEXT on the server, so the counter and the limit agree.
const MAX_TEXT = 8000;

type BatchImportProps = { slug: string; workTypes: { key: string; name: string }[] };

/**
 * Issue #3: a coordinator pastes a story, reviews one draft per home and creates them together.
 * The pasted text stays in memory only (it may name people who did not consent); the drafts are
 * kept in the phone until created, each with its id, so a retry never creates a home twice.
 */
export function BatchImport({ slug, workTypes }: BatchImportProps) {
  const t = useTranslations("worksites.batch");
  const errorMessage = useErrorMessage();
  const locale = useLocale() as Locale;
  const [text, setText] = useState("");
  const [drafts, setDrafts, clearDrafts] = usePersistedState(`aluvia.batch-drafts.${slug}`, NO_DRAFTS);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [extracting, startExtract] = useTransition();
  const [creating, startCreate] = useTransition();

  const update = (id: string, change: (draft: Draft) => Draft) =>
    setDrafts((list) => list.map((draft) => (draft.id === id ? change(draft) : draft)));

  const extract = () =>
    startExtract(async () => {
      setError(null);
      setCreated(null);
      try {
        const result = await extractDrafts({ slug, locale, text });
        if (!result.ok) return setError(result.code);
        track("worksite_drafts_extracted", { count: result.drafts.length });
        setDrafts((list) => [
          ...list,
          ...result.drafts.map((draft) => ({ id: crypto.randomUUID(), ...draft })),
        ]);
        setText("");
      } catch {
        setError("network_error");
      }
    });

  const ready =
    drafts.length > 0 && drafts.every((d) => d.addressText.trim() !== "" && d.workTypeKeys.length > 0);

  const create = () =>
    startCreate(async () => {
      setError(null);
      try {
        const result = await importWorksites({
          slug,
          reports: drafts.map((draft) => ({
            id: draft.id,
            locale,
            location: null,
            workTypeKeys: draft.workTypeKeys,
            hasVulnerablePeople: draft.hasVulnerablePeople,
            isPersonInDanger: draft.isPersonInDanger,
            contact: { addressText: draft.addressText },
          })),
        });
        if (!result.ok) return setError(result.code);
        clearDrafts();
        setCreated(result.created);
      } catch {
        setError("network_error");
      }
    });

  return (
    <div className="flex flex-col gap-8">
      <Card className="gap-4">
        <Field id="batch-text" label={t("textLabel")} hint={t("textHint")}>
          <Textarea
            rows={8}
            maxLength={MAX_TEXT}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <Button onClick={extract} disabled={extracting || text.trim() === ""} className="self-start">
          {extracting ? <Spinner label={t("extracting")} /> : null}
          {extracting ? t("extracting") : t("extract")}
        </Button>
      </Card>

      {error ? <FormError>{errorMessage(error)}</FormError> : null}

      {created !== null ? (
        <Card className="animate-enter gap-3">
          <Chip tone="done" className="self-start">
            {t("createdChip")}
          </Chip>
          <p className="text-body text-ink-soft">{t("created", { count: created })}</p>
        </Card>
      ) : null}

      {drafts.length > 0 ? (
        <section aria-labelledby="batch-drafts" className="flex flex-col gap-3">
          <h2 id="batch-drafts" className="text-subheading font-medium text-ink">
            {t("draftsTitle", { count: drafts.length })}
          </h2>
          {drafts.map((draft, index) => (
            <Card key={draft.id} className="gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Chip>{t("draftChip", { number: index + 1 })}</Chip>
                  {draft.isPersonInDanger ? <Chip tone="urgent">{t("dangerChip")}</Chip> : null}
                </div>
                <IconButton
                  variant="ghost"
                  label={t("remove")}
                  onClick={() => setDrafts((list) => list.filter((item) => item.id !== draft.id))}
                >
                  <X />
                </IconButton>
              </div>
              <Field id={`draft-${draft.id}-address`} label={t("addressLabel")}>
                <Input
                  value={draft.addressText}
                  onChange={(event) => update(draft.id, (d) => ({ ...d, addressText: event.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {workTypes.map((type) => (
                  <ToggleTile
                    key={type.key}
                    pressed={draft.workTypeKeys.includes(type.key)}
                    onPressedChange={(pressed) =>
                      update(draft.id, (d) => ({
                        ...d,
                        workTypeKeys: pressed
                          ? [...d.workTypeKeys, type.key]
                          : d.workTypeKeys.filter((key) => key !== type.key),
                      }))
                    }
                  >
                    {type.name}
                  </ToggleTile>
                ))}
              </div>
              <ToggleTile
                pressed={draft.hasVulnerablePeople}
                onPressedChange={(pressed) =>
                  update(draft.id, (d) => ({ ...d, hasVulnerablePeople: pressed }))
                }
              >
                {t("vulnerable")}
              </ToggleTile>
              {draft.workTypeKeys.length === 0 ? (
                <p className="text-caption text-ink-muted">{t("needsMissing")}</p>
              ) : null}
            </Card>
          ))}
          <Button block onClick={create} disabled={!ready || creating}>
            {creating ? <Spinner label={t("creating")} /> : null}
            {creating ? t("creating") : t("create", { count: drafts.length })}
          </Button>
          <p className="text-center text-caption text-ink-muted">{t("createHint")}</p>
        </section>
      ) : null}
    </div>
  );
}
