import { Skeleton } from "~/components/ui/skeleton";

/**
 * The shapes every loading state uses.
 *
 * Loading used to be the word "Loading..." in six places, which tells you
 * nothing about what is coming and makes the page jump when it arrives. These
 * stand in for the real content at roughly its size, so the layout holds still.
 *
 * Deliberately not illustrated: a mascot on every fetch would be noise at the
 * frequency this renders. Theme comes through the tokens the skeleton is
 * already built from.
 */

/** Dashboard account cards. */
export function CardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      data-testid="loading-skeleton"
      className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-card rounded-lg p-6 shadow">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-3 h-8 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

/** Any of the transaction/holdings tables. */
export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div data-testid="loading-skeleton" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A headline figure above supporting detail — the account and summary cards. */
export function SummarySkeleton() {
  return (
    <div data-testid="loading-skeleton" className="space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="bg-card rounded-lg p-6 shadow">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-2 h-10 w-48" />
      </div>
    </div>
  );
}
