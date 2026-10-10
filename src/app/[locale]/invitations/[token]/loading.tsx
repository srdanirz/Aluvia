import { GlassPanel, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow flex-col justify-center px-4 py-16">
      <GlassPanel className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-full" />
        </div>
        <Skeleton className="h-11 w-full rounded-full" />
      </GlassPanel>
    </main>
  );
}
