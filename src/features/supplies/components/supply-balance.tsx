import { CircleSlash, PackageOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardTitle, Section } from "@/shared/ui";

import type { SupplyBalance as Balance } from "../server";

/**
 * What to take and what not to, before anyone loads a car (issue #14): the supplies homes miss,
 * most missed first, and the ones collection points have too much of. Nothing when nobody marked
 * either, so an early emergency does not show an empty box.
 */
export async function SupplyBalance({ balance }: { balance: Balance }) {
  if (balance.missing.length === 0 && balance.surplus.length === 0) return null;
  const t = await getTranslations("supplies");
  return (
    <Section title={t("title")} lead={t("lead")}>
      <div className="grid gap-3 md:grid-cols-2">
        {balance.missing.length > 0 ? (
          <Card inset className="gap-3">
            <CardTitle className="flex items-center gap-2">
              <PackageOpen aria-hidden className="size-icon-sm" strokeWidth={1.5} />
              {t("missingTitle")}
            </CardTitle>
            <ul className="flex flex-col gap-2">
              {balance.missing.map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-3 text-body text-ink">
                  {item.name}
                  <span className="text-body-sm text-ink-soft tabular-nums">
                    {t("missingAt", { count: item.missingAt })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {balance.surplus.length > 0 ? (
          <Card inset className="gap-3">
            <CardTitle className="flex items-center gap-2">
              <CircleSlash aria-hidden className="size-icon-sm" strokeWidth={1.5} />
              {t("surplusTitle")}
            </CardTitle>
            <ul className="flex flex-col gap-2">
              {balance.surplus.map((item) => (
                <li key={item.key} className="flex items-baseline justify-between gap-3 text-body text-ink">
                  {item.name}
                  <span className="text-body-sm text-ink-soft tabular-nums">
                    {t("surplusAt", { count: item.surplusAt })}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </Section>
  );
}
