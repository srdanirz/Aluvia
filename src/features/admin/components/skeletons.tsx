import { Card, Skeleton } from "@/shared/ui";

// loading.tsx shapes for the admin views: the same header, cards and fields the views render.

function HeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <Skeleton className="h-10 w-2/3 max-w-narrow" />
      {withAction ? <Skeleton className="h-11 w-1/2 md:w-1/4 rounded-full" /> : null}
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      <HeaderSkeleton withAction />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Card key={row}>
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-4 w-1/3" />
          </Card>
        ))}
      </div>
    </div>
  );
}

function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

export function FormSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="flex max-w-prose flex-col gap-12">
      <HeaderSkeleton />
      <div className="flex flex-col gap-6">
        {Array.from({ length: cards }, (_, card) => (
          <Card key={card} className="gap-4">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </Card>
        ))}
        <Skeleton className="h-11 w-1/2 md:w-1/4 rounded-full" />
      </div>
    </div>
  );
}
