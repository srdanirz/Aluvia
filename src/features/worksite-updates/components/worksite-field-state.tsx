import { getFormatter, getTranslations } from "next-intl/server";
import * as rootParams from "next/root-params";

import { Link } from "@/shared/i18n/navigation";
import { Button, Card, Chip, Disclosure } from "@/shared/ui";

import { loadWorksiteFieldView } from "../server/views";
import { HideUpdateButton } from "./hide-update-button";

/**
 * "Personas e insumos" on a home's page: the current count and what is missing, how long ago it was
 * updated, and the button anyone uses to update it (ADR 0018). Coordinators also get the recent
 * history, each entry tagged by member or anonymous device, with a button to hide it.
 */
export async function WorksiteFieldState({
  slug,
  emergencyId,
  worksiteId,
  now,
}: {
  slug: string;
  emergencyId: string;
  worksiteId: string;
  now: Date;
}) {
  const locale = await rootParams.locale();
  const [{ current, supplyNames, history }, t, format] = await Promise.all([
    loadWorksiteFieldView({ emergencyId, worksiteId, locale }),
    getTranslations("worksiteUpdates.state"),
    getFormatter(),
  ]);
  const supplies = (keys: string[]) =>
    format.list(
      keys.map((key) => supplyNames[key] ?? key),
      { type: "conjunction" },
    );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-subheading font-medium text-ink">{t("title")}</h2>
      {current ? (
        <Card inset className="gap-2">
          <p className="text-body text-ink">{t("people", { count: current.peoplePresent })}</p>
          <p className="text-body-sm text-ink-soft">
            {current.missingSupplyKeys.length > 0
              ? t("missing", { supplies: supplies(current.missingSupplyKeys) })
              : t("nothingMissing")}
          </p>
          <p className="text-caption text-ink-muted">
            {t("updated", { relative: format.relativeTime(current.createdAt, now) })}
          </p>
        </Card>
      ) : (
        <p className="text-body-sm text-ink-soft">{t("empty")}</p>
      )}
      <Button variant="secondary" className="self-start" asChild>
        <Link href={`/emergencies/${slug}/worksites/${worksiteId}/updates/new`}>{t("update")}</Link>
      </Button>
      {history && history.length > 0 ? (
        <Disclosure label={t("history", { count: history.length })}>
          <ul className="flex flex-col gap-2">
            {history.map((entry) => (
              <li key={entry.id}>
                <Card inset className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-sm text-ink">
                      {t("people", { count: entry.peoplePresent })}
                    </span>
                    {entry.isCancelled ? <Chip tone="closed">{t("hidden")}</Chip> : null}
                  </div>
                  {entry.missingSupplyKeys.length > 0 ? (
                    <p className="text-caption text-ink-soft">
                      {t("missing", { supplies: supplies(entry.missingSupplyKeys) })}
                    </p>
                  ) : null}
                  <p className="text-caption text-ink-muted">
                    {t("entryMeta", {
                      relative: format.relativeTime(entry.createdAt, now),
                      actor: entry.isMember
                        ? t("actorMember")
                        : t("actorDevice", { tag: entry.deviceTag ?? "-" }),
                    })}
                  </p>
                  {entry.isCancelled ? null : (
                    <HideUpdateButton emergencyId={emergencyId} updateId={entry.id} />
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </Disclosure>
      ) : null}
    </section>
  );
}
