import { GlassPanel, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow flex-col justify-center gap-8 px-4 py-16">
      <Skeleton className="h-8 w-1/3" />
      <GlassPanel className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-11 w-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </GlassPanel>
    </main>
  );
}
