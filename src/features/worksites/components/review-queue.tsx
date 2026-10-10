"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useErrorMessage } from "@/shared/i18n/use-error-message";
import { Button, Card, CardBody, Chip, FormError, Spinner } from "@/shared/ui";

import { loadReviewQueue, resolveReviewFlag, reviewHazards } from "../server/actions";
import type { ReviewItem, ReviewPage } from "../server/review-queue";

type ReviewQueueProps = { slug: string; initial: ReviewPage };

/**
 * Issue #43: the homes a coordinator has to look at, oldest first. Each flag is settled on its
 * own; every action carries the home's version, so two coordinators never overwrite each other.
 */
export function ReviewQueue({ slug, initial }: ReviewQueueProps) {
  const t = useTranslations("worksites.review");
  const errorMessage = useErrorMessage();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadMore = () =>
    startLoading(async () => {
      setError(null);
      try {
        const result = await loadReviewQueue({ slug, cursor });
        if (!result.ok) return setError(result.code);
        setItems((list) => [...list, ...result.page.items]);
        setCursor(result.page.nextCursor);
      } catch {
        setError("network_error");
      }
    });

  // Applies an action's outcome to one home: the new version, or the home leaves the queue.
  const settle = async (
    item: ReviewItem,
    run: () => Promise<{ ok: true; version: number } | { ok: false; code: string }>,
    change: (item: ReviewItem) => ReviewItem,
  ) => {
    setBusyId(item.id);
    setError(null);
    try {
      const result = await run();
      if (!result.ok) return setError(result.code);
      setItems((list) =>
        list
          .map((current) =>
            current.id === item.id ? { ...change(current), version: result.version } : current,
          )
          .filter(
            (current) =>
              !current.hasLocation || current.reviewFlags.length > 0 || current.pendingHazards.length > 0,
          ),
      );
    } catch {
      setError("network_error");
    } finally {
      setBusyId(null);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <Chip tone="done" className="self-start">
          {t("emptyChip")}
        </Chip>
        <CardBody>{t("empty")}</CardBody>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormError>{errorMessage(error)}</FormError> : null}
      {items.map((item) => (
        <ReviewCard
          key={item.id}
          item={item}
          busy={busyId === item.id}
          onResolve={(flag) =>
            void settle(
              item,
              () => resolveReviewFlag({ slug, worksiteId: item.id, version: item.version, flag }),
              (current) => ({ ...current, reviewFlags: current.reviewFlags.filter((f) => f !== flag) }),
            )
          }
          onHazardsReviewed={() =>
            void settle(
              item,
              () => reviewHazards({ slug, worksiteId: item.id, version: item.version }),
              (current) => ({ ...current, pendingHazards: [] }),
            )
          }
        />
      ))}
      {cursor ? (
        <Button variant="secondary" onClick={loadMore} disabled={loading} className="self-center">
          {loading ? <Spinner label={t("loadingMore")} /> : null}
          {t("loadMore")}
        </Button>
      ) : null}
    </div>
  );
}

type ReviewCardProps = {
  item: ReviewItem;
  busy: boolean;
  onResolve: (flag: ReviewItem["reviewFlags"][number]) => void;
  onHazardsReviewed: () => void;
};

function ReviewCard({ item, busy, onResolve, onHazardsReviewed }: ReviewCardProps) {
  const t = useTranslations("worksites.review");
  const tHazard = useTranslations("worksites.hazard");
  const format = useFormatter();

  return (
    <Card className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption text-ink-muted">
          {t("reported", {
            time: format.relativeTime(item.createdAt),
            source: t(`source.${item.source}`),
          })}
        </span>
        {busy ? <Spinner label={t("saving")} /> : null}
      </div>
      <p className="text-body text-ink">{item.addressText ?? t("noAddress")}</p>
      {item.notes ? <CardBody>{item.notes}</CardBody> : null}

      {!item.hasLocation ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Chip tone="pending">{t("flag.no_location")}</Chip>
          <span className="text-caption text-ink-muted">{t("placeLater")}</span>
        </div>
      ) : null}

      {item.reviewFlags.map((flag) => (
        <div key={flag} className="flex flex-wrap items-center justify-between gap-3">
          <Chip tone={flag === "person_in_danger" ? "urgent" : "pending"}>{t(`flag.${flag}`)}</Chip>
          <Button variant="ghost" disabled={busy} onClick={() => onResolve(flag)}>
            {t("resolve")}
          </Button>
        </div>
      ))}

      {item.pendingHazards.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {item.pendingHazards.map((hazard) => (
              <Chip key={hazard} tone="urgent">
                {t("hazard", { hazard: tHazard(hazard) })}
              </Chip>
            ))}
          </div>
          <Button variant="ghost" disabled={busy} onClick={onHazardsReviewed}>
            {t("hazardsReviewed")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
