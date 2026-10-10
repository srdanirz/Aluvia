"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { track } from "@/shared/analytics/client";
import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { discardOutboxEntry, enqueue } from "@/shared/offline/outbox";
import { usePersistedState } from "@/shared/offline/use-persisted-state";
import { Button, Card, Field, FormError, Spinner, Textarea, ToggleTile } from "@/shared/ui";

import { toE164 } from "../phone";
import type { WorksiteReportInput, WorksiteSource } from "../schemas";
import type { EmergencyNumber } from "../server/queries";
import { DangerCard } from "./danger-card";
import { LocationCard } from "./location-card";
import { PendingWrites } from "./pending-writes";
import { EMPTY_DRAFT } from "./report-draft";
import { ReportDetails } from "./report-details";
import { ReportDone } from "./report-done";
import { useCurrentLocation } from "./use-current-location";

type ReportFormProps = {
  slug: string;
  workTypes: { key: string; name: string }[];
  emergencyNumbers: EmergencyNumber[];
  /** For the product event only; the server decides the stored source on its own. */
  source: Extract<WorksiteSource, "neighbor" | "coordinator">;
};

type Sent = { worksiteId: string; delivery: "sent" | "queued" };

/**
 * Report a home in three taps: the GPS is asked for on open, needs are big tiles, send. Every
 * other field is optional and folded away. The draft lives in the phone until it is sent, and a
 * send without signal stays queued in the outbox, so nothing typed is ever lost.
 */
export function ReportForm({ slug, workTypes, emergencyNumbers, source }: ReportFormProps) {
  const t = useTranslations("worksites.report");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const { location, retry } = useCurrentLocation();
  const [draft, setDraft, clearDraft] = usePersistedState(`aluvia.report-draft.${slug}`, EMPTY_DRAFT);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);

  const phone = toE164(draft.phone, typeof navigator === "undefined" ? [] : navigator.languages);
  const phoneError = draft.phone.trim() !== "" && phone === null;
  const hasFix = location.status === "ready" || location.status === "approximate";
  const point = hasFix ? { lng: location.lng, lat: location.lat } : null;
  const hasPlace = point !== null || draft.addressText.trim() !== "";
  // Either is enough: a sentence in their own words, or tapping what it needs (DESIGN.md, sin fricción).
  const described = draft.workTypeKeys.length > 0 || draft.notes.trim() !== "";
  const missing = !described ? "needs" : !hasPlace ? "location" : null;

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
      location: point,
      locationAccuracyMeters: hasFix ? location.accuracyMeters : null,
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
      hasLocation: point !== null,
      workTypeCount: draft.workTypeKeys.length,
      delivery: result.status,
    });
    clearDraft();
    setDetailsOpen(false);
    setSent({ worksiteId: id, delivery: result.status });
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

      <ToggleTile
        pressed={draft.isPersonInDanger}
        onPressedChange={(isPersonInDanger) => setDraft((current) => ({ ...current, isPersonInDanger }))}
      >
        {t("danger.toggle")}
      </ToggleTile>
      {draft.isPersonInDanger ? <DangerCard numbers={emergencyNumbers} /> : null}

      <LocationCard
        location={location}
        onRetry={retry}
        addressText={draft.addressText}
        onAddressChange={(addressText) => setDraft((current) => ({ ...current, addressText }))}
      />

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
              hasLocation={location.status === "ready"}
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
