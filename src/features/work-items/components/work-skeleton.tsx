import { Card, Page, Skeleton } from "@/shared/ui";

/** Loading shape of the work and shift lists: header, an action, then cards like the real ones. */
export function WorkSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
      <Skeleton className="h-11 w-1/2 rounded-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: cards }, (_, index) => (
          <Card key={index} className="gap-3">
            <Skeleton className="h-6 w-1/3 rounded-full" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-11 w-full rounded-full" />
          </Card>
        ))}
      </div>
    </Page>
  );
}
