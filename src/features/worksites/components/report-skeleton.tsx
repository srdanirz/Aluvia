import { Card, Skeleton } from "@/shared/ui";

/** The report screens' loading shape: header, a card, a grid of tiles and the send button. */
export function ReportSkeleton({ tiles = 6 }: { tiles?: number }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow flex-col gap-8 px-4 py-8 md:py-16">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-3/4" />
      </div>
      <Card className="gap-4">
        <Skeleton shape="pill" className="h-6 w-1/3" />
      </Card>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-1/2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: tiles }, (_, index) => (
            <Skeleton key={index} shape="card" className="h-16" />
          ))}
        </div>
      </div>
      <Skeleton shape="pill" className="h-11 w-full" />
    </main>
  );
}
