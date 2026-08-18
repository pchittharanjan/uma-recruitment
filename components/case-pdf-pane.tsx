'use client';

import { cn } from '@/lib/utils';

export function CasePdfPane({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[40vh] flex-col bg-muted/20 lg:min-h-0',
        'border-b border-border/20 lg:border-r lg:border-b-0',
        className,
      )}
    >
      <p className="shrink-0 px-5 py-3 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:px-6">
        {title}
      </p>
      <iframe
        src={`${url}#view=FitH`}
        title={title}
        className="min-h-0 w-full flex-1 bg-white"
      />
    </div>
  );
}
