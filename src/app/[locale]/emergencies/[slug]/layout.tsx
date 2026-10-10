import { CalendarClock, HandHeart, House, Map } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FloatingNav } from "@/shared/ui";

async function EmergencyNav({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, t] = await Promise.all([params, getTranslations("emergency.nav")]);
  const base = `/emergencies/${slug}`;
  return (
    <FloatingNav
      label={t("label")}
      items={[
        { href: base, label: t("map"), icon: <Map /> },
        { href: `${base}/worksites/new`, label: t("report"), icon: <House /> },
        { href: `${base}/work-items`, label: t("help"), icon: <HandHeart /> },
        { href: `${base}/shifts`, label: t("shifts"), icon: <CalendarClock /> },
      ]}
    />
  );
}

// Every screen of an emergency shares one nav, so the map, reporting, helping and shifts are one
// tap apart. The slug is request data, so the nav streams in its own Suspense instead of making the
// whole route dynamic; who may see each view is still checked by every page and Server Action.
export default function EmergencyLayout({ children, params }: LayoutProps<"/[locale]/emergencies/[slug]">) {
  return (
    <>
      <Suspense fallback={null}>
        <EmergencyNav params={params} />
      </Suspense>
      {children}
    </>
  );
}
