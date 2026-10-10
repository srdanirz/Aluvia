import { Megaphone } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Card, CardBody } from "@/shared/ui";

/**
 * The emergency's official notice, pinned above public pages (ADR 0015). Renders nothing when
 * there is none, so pages can always place it.
 */
export async function OfficialNotice({ text }: { text: string | null }) {
  if (!text) return null;
  const t = await getTranslations("admin.notice");
  return (
    <Card selected role="note" aria-label={t("label")}>
      <p className="flex items-center gap-2 text-caption font-medium text-ink">
        <Megaphone aria-hidden size={18} strokeWidth={1.5} />
        {t("label")}
      </p>
      <CardBody className="text-body text-ink">{text}</CardBody>
    </Card>
  );
}
