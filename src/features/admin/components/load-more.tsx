import { getTranslations } from "next-intl/server";

import { Link } from "@/shared/i18n/navigation";
import { Button } from "@/shared/ui";

/** Next page of a keyset-paged list, as a plain link so it works without JavaScript. */
export async function LoadMore({ pathname, cursor }: { pathname: string; cursor: string | null }) {
  if (!cursor) return null;
  const t = await getTranslations("admin.common");
  return (
    <Button variant="secondary" asChild className="self-start">
      <Link href={{ pathname, query: { after: cursor } }}>{t("more")}</Link>
    </Button>
  );
}
