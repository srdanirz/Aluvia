import { Layers, MessageSquare, Siren } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { FloatingNav } from "@/shared/ui";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.meta");
  return { title: t("title"), robots: { index: false, follow: false } };
}

// Static shell: who may see each view is checked by every page and Server Action, not here.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("admin.nav");
  return (
    <>
      <FloatingNav
        label={t("label")}
        items={[
          { href: "/admin/emergencies", label: t("emergencies"), icon: <Siren /> },
          { href: "/admin/disaster-types", label: t("disasterTypes"), icon: <Layers /> },
          { href: "/admin/feedback", label: t("feedback"), icon: <MessageSquare /> },
        ]}
      />
      <main className="mx-auto flex max-w-content flex-col gap-12 px-4 pt-16 pb-nav-bottom md:px-8 md:pt-nav-top md:pb-16">
        {children}
      </main>
    </>
  );
}
