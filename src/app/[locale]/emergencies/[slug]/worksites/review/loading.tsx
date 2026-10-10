import { Card, Page, Skeleton } from "@/shared/ui";

export default function Loading() {
  return (
    <Page>
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
    </Page>
  );
}
