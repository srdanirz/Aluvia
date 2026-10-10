import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { Suspense } from "react";

import { MapShell } from "@/features/map/components/map-shell";
import { WorksiteMap } from "@/features/map/components/worksite-map";
import { slugSchema } from "@/features/map/schemas";
import { findMapEmergency } from "@/features/map/server/map-emergency";
import { Skeleton } from "@/shared/ui";

async function EmergencyMap({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await rootParams.locale();
  if (!slugSchema.safeParse(slug).success) notFound();
  const emergency = await findMapEmergency(slug, locale);
  if (!emergency) notFound();
  return <WorksiteMap slug={slug} bounds={emergency.bounds} area={emergency.area} />;
}

// The map is the one piece allowed its own Suspense (DESIGN.md, Carga): it loads apart from the
// page, behind a skeleton of its exact size, and stays mounted while the panel changes.
export default function MapLayout({ children, params }: LayoutProps<"/[locale]/emergencies/[slug]">) {
  return (
    <MapShell
      map={
        <Suspense fallback={<Skeleton className="size-full rounded-none" />}>
          <EmergencyMap params={params} />
        </Suspense>
      }
      panel={children}
    />
  );
}
