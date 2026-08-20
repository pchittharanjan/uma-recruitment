'use client';

import { formatLastUpdated } from '@/lib/last-updated';
import { cn } from '@/lib/utils';

export function AppCreditBar({ className }: { className?: string }) {
  const lastUpdated = formatLastUpdated();

  return (
    <footer
      data-interview-chrome=""
      className={cn(
        'flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-muted/40 px-5 pb-px sm:px-8',
        'font-heading text-[11px] leading-none text-muted-foreground sm:text-xs',
        className,
      )}
    >
      <span className="flex h-full min-w-0 items-center truncate leading-none -translate-y-px">
        Built By Pranav Chittharanjan
      </span>
      <span className="flex h-full shrink-0 items-center leading-none -translate-y-px">
        Last Updated: {lastUpdated}
      </span>
    </footer>
  );
}
