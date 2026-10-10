import { Card, Skeleton } from "@/shared/ui";

function CardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="mt-2 h-11 w-1/3 rounded-full" />
    </Card>
  );
}

export default function Loading() {
  return (
    <main className="mx-auto flex max-w-content flex-col gap-12 px-4 pt-16 pb-nav-bottom md:px-8 md:pt-nav-top md:pb-16">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-6 w-full max-w-prose" />
      </div>
      {[0, 1, 2].map((section) => (
        <div key={section} className="flex flex-col gap-3">
          <Skeleton className="h-6 w-1/2" />
          <div className="grid gap-3 md:grid-cols-2">
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ))}
    </main>
  );
}
