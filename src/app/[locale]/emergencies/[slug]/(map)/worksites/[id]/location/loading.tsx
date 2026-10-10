import { GlassPanel, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <GlassPanel className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </GlassPanel>
  );
}
