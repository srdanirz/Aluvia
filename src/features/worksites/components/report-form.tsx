"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@/shared/analytics/client";
import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { discardOutboxEntry, enqueue } from "@/shared/offline/outbox";
import { usePersistedState } from "@/shared/offline/use-persisted-state";
import { Button, Card, Field, FormError, Input, Spinner, Textarea, ToggleTile } from "@/shared/ui";

import { toE164 } from "../phone";
import type { WorksiteReportInput, WorksiteSource } from "../schemas";
import type { EmergencyNumber } from "../server/queries";
import { DangerCard } from "./danger-card";
import { PendingWrites } from "./pending-writes";
import { EMPTY_DRAFT } from "./report-draft";
import { ReportDetails } from "./report-details";
import { ReportDone } from "./report-done";

type ReportFormProps = {
  slug: string;
  workTypes: { key: string; name: string }[];
  emergencyNumbers: EmergencyNumber[];
  /** For the product event only; the server decides the stored source on its own. */
  source: Extract<WorksiteSource, "neighbor" | "coordinator">;
};

type Sent = { worksiteId: string; delivery: "sent" | "queued" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The answer goes into a link, so only a well-formed id is taken from it.
function answeredWorksiteId(response: unknown, fallback: string): string {
  const id = typeof response === "object" && response !== null && "id" in response ? response.id : null;
  return typeof id === "string" && UUID.test(id) ? id : fallback;
}

/**
 * Report a home: the written address first (it is how people get there, and the server places it
 * on the map), then what happens in their words or by tapping needs. Every other field is optional
 * and folded away. No GPS: the reporter is often not at the home, and a fix from elsewhere would
 * put the pin on the wrong block. The draft lives in the phone until it is sent, and a send
 * without signal stays queued in the outbox, so nothing typed is ever lost.
 */
export function ReportForm({ slug, workTypes, emergencyNumbers, source }: ReportFormProps) {
  const t = useTranslations("worksites.report");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const [draft, setDraft, clearDraft] = usePersistedState(`aluvia.report-draft.${slug}`, EMPTY_DRAFT);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const phone = toE164(draft.phone, typeof navigator === "undefined" ? [] : navigator.languages);
  const phoneError = draft.phone.trim() !== "" && phone === null;
  const hasAddress = draft.addressText.trim() !== "";
  // Either is enough: a sentence in their own words, or tapping what it needs (DESIGN.md, sin fricción).
  const described = draft.workTypeKeys.length > 0 || draft.notes.trim() !== "";
  const missing = !hasAddress ? "address" : !described ? "needs" : null;

  const toggleNeed = (key: string, pressed: boolean) =>
    setDraft((current) => ({
      ...current,
      workTypeKeys: pressed
        ? [...current.workTypeKeys, key]
        : current.workTypeKeys.filter((selected) => selected !== key),
    }));

  const submit = async () => {
    if (missing || phoneError || sending) return;
    setSending(true);
    setRejection(null);
    const id = crypto.randomUUID();
    const body: WorksiteReportInput = {
      id,
      locale,
      workTypeKeys: draft.workTypeKeys,
      damageLevel: draft.damageLevel,
      hasVulnerablePeople: draft.hasVulnerablePeople,
      isPersonInDanger: draft.isPersonInDanger,
      hazards: draft.hazards,
      contact: {
        name: draft.name,
        phone,
        addressText: draft.addressText,
        notes: draft.notes,
        publicContact: draft.publicContact,
        notifyChannel: phone && draft.notifyChannel !== "none" ? draft.notifyChannel : null,
      },
    };
    const result = await enqueue({
      id,
      kind: "worksite",
      url: `/api/v1/emergencies/${slug}/worksites`,
      body,
    });
    setSending(false);
    if (result.status === "rejected") {
      // The draft is still on screen to fix and resend, so the refused copy is not kept twice.
      discardOutboxEntry(id);
      track("worksite_report_rejected", { code: result.code });
      setRejection(result.code);
      return;
    }
    track("worksite_reported", {
      source,
      hasNotes: draft.notes.trim() !== "",
      workTypeCount: draft.workTypeKeys.length,
      delivery: result.status,
    });
    clearDraft();
    setDetailsOpen(false);
    // A report naming an official parcel ends on that home, not on its own id; the server says which.
    const worksiteId = result.status === "sent" ? answeredWorksiteId(result.response, id) : id;
    setSent({ worksiteId, delivery: result.status });
  };

  if (sent) {
    return (
      <ReportDone
        slug={slug}
        worksiteId={sent.worksiteId}
        delivery={sent.delivery}
        onAnother={() => setSent(null)}
      />
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
      <PendingWrites kind="worksite" />

      <Field id="report-address" label={t("address.label")} hint={t("address.hint")}>
        <Input
          required
          autoComplete="street-address"
          value={draft.addressText}
          onChange={(event) => setDraft((current) => ({ ...current, addressText: event.target.value }))}
        />
      </Field>

      <ToggleTile
        pressed={draft.isPersonInDanger}
        onPressedChange={(isPersonInDanger) => setDraft((current) => ({ ...current, isPersonInDanger }))}
      >
        {t("danger.toggle")}
      </ToggleTile>
      {draft.isPersonInDanger ? <DangerCard numbers={emergencyNumbers} /> : null}

      <Field id="report-notes" label={t("story.label")} hint={t("story.hint")}>
        <Textarea
          rows={3}
          value={draft.notes}
          placeholder={t("story.placeholder")}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
        />
      </Field>

      <section aria-labelledby="report-needs" className="flex flex-col gap-4">
        <h2 id="report-needs" className="text-subheading font-medium text-ink">
          {t("needs.title")}
        </h2>
        {workTypes.length === 0 ? (
          <Card>
            <p className="text-body-sm text-ink-soft">{t("needs.empty")}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {workTypes.map((type) => (
              <ToggleTile
                key={type.key}
                pressed={draft.workTypeKeys.includes(type.key)}
                onPressedChange={(pressed) => toggleNeed(type.key, pressed)}
              >
                {type.name}
              </ToggleTile>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <Button
          variant="ghost"
          aria-expanded={detailsOpen}
          aria-controls="report-details"
          onClick={() => setDetailsOpen((open) => !open)}
          className="self-start"
        >
          {detailsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          {t("details.toggle")}
        </Button>
        {detailsOpen ? (
          <div id="report-details">
            <ReportDetails
              draft={draft}
              onChange={setDraft}
              phoneError={phoneError}
              phoneIsValid={phone !== null}
            />
          </div>
        ) : null}
      </section>

      <div className="flex flex-col gap-3">
        <Button type="submit" block disabled={missing !== null || phoneError || sending}>
          {sending ? <Spinner label={t("sending")} /> : null}
          {sending ? t("sending") : t("submit")}
        </Button>
        {missing ? (
          <p className="text-center text-caption text-ink-muted">{t(`missing.${missing}`)}</p>
        ) : null}
        {rejection ? (
          <FormError size="field" className="text-center">
            {errorMessage(rejection)}
          </FormError>
        ) : null}
      </div>
    </form>
  );
}
