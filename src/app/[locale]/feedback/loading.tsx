import { GlassPanel, Page, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <Page nav={false}>
      <Skeleton className="h-8 w-1/3" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-5 w-full" />
      </div>
      <GlassPanel className="flex flex-col gap-6">
        <Skeleton shape="pill" className="h-11 w-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton shape="pill" className="h-11 w-full" />
      </GlassPanel>
      <Skeleton className="h-5 w-3/4" />
    </Page>
  );
}
