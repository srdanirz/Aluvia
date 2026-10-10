"use client";

import { ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

import { Link } from "@/shared/i18n/navigation";
import { Card, GlassPanel, IconButton } from "@/shared/ui";

import { HomeStateChip } from "./home-state-chip";
import type { OpenCell } from "./map-shell";

/**
 * The homes of one block, when the map cannot split them further (they share one block or one
 * point).
 * Most urgent first, as the query orders them.
 */
export function CellPanel({ cell, onClose }: { cell: OpenCell; onClose: () => void }) {
  const t = useTranslations("map");
  const { slug } = useParams<{ slug: string }>();
  const homes = cell.worksites ?? [];
  const hidden = cell.count - homes.length;

  return (
    <GlassPanel className="flex min-h-0 animate-enter flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-subheading font-medium text-ink">{t("cell.title", { count: cell.count })}</h2>
        <IconButton variant="ghost" label={t("cell.close")} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <ul className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        {homes.map((home, index) => {
          return (
            <li key={home.id}>
              <Link
                href={`/emergencies/${slug}/worksites/${home.id}`}
                onClick={onClose}
                className="block rounded-card"
              >
                <Card interactive size="compact" className="flex-row items-center justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <span className="text-body font-medium text-ink">
                      {home.address ?? t("cell.home", { position: index + 1 })}
                    </span>
                    <HomeStateChip level={home.level} />
                  </div>
                  <ChevronRight aria-hidden className="size-icon shrink-0 text-ink-muted" strokeWidth={1.5} />
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? <p className="text-body-sm text-ink-soft">{t("cell.more", { count: hidden })}</p> : null}
    </GlassPanel>
  );
}
