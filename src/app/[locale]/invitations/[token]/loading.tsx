import { GlassPanel, Page, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <Page nav={false} align="center">
      <GlassPanel className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </GlassPanel>
    </Page>
  );
}
