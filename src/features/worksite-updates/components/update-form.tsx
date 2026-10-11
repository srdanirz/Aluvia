"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@/shared/analytics/client";
import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { Link } from "@/shared/i18n/navigation";
import { discardOutboxEntry, enqueue } from "@/shared/offline/outbox";
import { usePersistedState } from "@/shared/offline/use-persisted-state";
import { Button, ButtonGroup, Card, Chip, FormError, Spinner, Stepper, ToggleTile } from "@/shared/ui";

import { MAX_PEOPLE_PRESENT, type WorksiteUpdate } from "../schemas";

type Draft = { people: number; missing: string[] };

type UpdateFormProps = {
  slug: string;
  worksiteId: string;
  supplyTypes: { key: string; name: string }[];
  /** The home's current state, so the volunteer corrects it instead of starting from zero. */
  current: { id: string; peoplePresent: number; missingSupplyKeys: string[]; createdAt: string } | null;
};

/**
 * Issue #18: people working now with plus and minus, missing supplies as tiles, one send. Built
 * for dirty hands: nothing to type. Sends the full state, never a delta (issue #15), through the
 * offline outbox.
 */
export function UpdateForm({ slug, worksiteId, supplyTypes, current }: UpdateFormProps) {
  const t = useTranslations("worksiteUpdates.form");
  const errorMessage = useErrorMessage();
  const format = useFormatter();
  // The count survives a closed tab until it is sent; with nothing saved it starts from the
  // home's current state.
  const [draft, setDraft, clearDraft] = usePersistedState<Draft | null>(
    `aluvia.update-draft.${worksiteId}`,
    null,
  );
  const people = draft?.people ?? current?.peoplePresent ?? 0;
  const missing = draft?.missing ?? current?.missingSupplyKeys ?? [];
  const setPeople = (value: number) =>
    setDraft((saved) => ({ people: value, missing: saved?.missing ?? missing }));
  const setMissing = (change: (keys: string[]) => string[]) =>
    setDraft((saved) => ({ people: saved?.people ?? people, missing: change(saved?.missing ?? missing) }));
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  // The live update this form builds on: the page's, then each one this form sent ("Contar de nuevo").
  const [baseUpdateId, setBaseUpdateId] = useState(current?.id ?? null);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    setRejection(null);
    const id = crypto.randomUUID();
    // The version check (ADR 0018): refused if someone else updated the home since this page loaded.
    const body: WorksiteUpdate = {
      id,
      previousUpdateId: baseUpdateId,
      peoplePresent: people,
      supplyTypeKeys: missing,
    };
    const result = await enqueue({
      id,
      kind: "worksite_update",
      url: `/api/v1/emergencies/${slug}/worksites/${worksiteId}/updates`,
      body,
    });
    setSending(false);
    if (result.status === "rejected") {
      discardOutboxEntry(id);
      setRejection(result.code);
      return;
    }
    track("worksite_update_recorded", { supplyCount: missing.length, delivery: result.status });
    clearDraft();
    setBaseUpdateId(id);
    setDone(result.status);
  };

  if (done) {
    return (
      <Card className="animate-enter gap-4">
        <Chip tone={done === "sent" ? "done" : "pending"} className="self-start">
          {done === "sent" ? t("sentChip") : t("queuedChip")}
        </Chip>
        <p className="text-body text-ink-soft">{done === "sent" ? t("sentBody") : t("queuedBody")}</p>
        <ButtonGroup label={t("actions")} className="w-full">
          <Button variant="ghost" asChild className="flex-1">
            <Link href={`/emergencies/${slug}/worksites/${worksiteId}`}>{t("viewHome")}</Link>
          </Button>
          <Button onClick={() => setDone(null)} className="flex-1">
            {t("again")}
          </Button>
        </ButtonGroup>
      </Card>
    );
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Card className="gap-4">
        <h2 className="text-subheading font-medium text-ink">{t("people")}</h2>
        <Stepper
          label={t("people")}
          value={people}
          onChange={setPeople}
          max={MAX_PEOPLE_PRESENT}
          decrementLabel={t("decrement")}
          incrementLabel={t("increment")}
        />
        {current ? (
          <p className="text-caption text-ink-muted">
            {t("lastUpdate", { time: format.relativeTime(new Date(current.createdAt)) })}
          </p>
        ) : null}
      </Card>

      <section aria-labelledby="update-supplies" className="flex flex-col gap-4">
        <h2 id="update-supplies" className="text-subheading font-medium text-ink">
          {t("supplies")}
        </h2>
        {supplyTypes.length === 0 ? (
          <Card>
            <p className="text-body-sm text-ink-soft">{t("suppliesEmpty")}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {supplyTypes.map((type) => (
              <ToggleTile
                key={type.key}
                pressed={missing.includes(type.key)}
                onPressedChange={(pressed) =>
                  setMissing((keys) =>
                    pressed ? [...keys, type.key] : keys.filter((key) => key !== type.key),
                  )
                }
              >
                {type.name}
              </ToggleTile>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-col gap-3">
        <Button type="submit" block disabled={sending}>
          {sending ? <Spinner label={t("sending")} /> : null}
          {sending ? t("sending") : t("submit")}
        </Button>
        {rejection ? (
          <FormError size="field" className="text-center">
            {errorMessage(rejection)}
          </FormError>
        ) : null}
      </div>
    </form>
  );
}
