import { PageContainer } from '@/components/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Full-page replacement only — never nest inside a card, sheet, or settings panel. */
export default function PageLoading({ className }: { className?: string }) {
  return (
    <PageContainer className={cn('space-y-8', className)}>
      <div className="space-y-8" aria-busy="true" aria-label="Loading" data-page-loading="">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-56 max-w-full sm:w-72" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Skeleton className="h-8 w-28 shrink-0" />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>

        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-5/6" />
          <Skeleton className="h-10 w-4/6" />
        </div>
      </div>
    </PageContainer>
  );
}
