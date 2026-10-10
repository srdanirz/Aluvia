import { Card, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-narrow flex-col gap-8 px-4 py-8 md:py-16">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="gap-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-6 w-1/2 rounded-full" />
          </Card>
        ))}
      </div>
    </main>
  );
}
