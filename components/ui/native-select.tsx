import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-1 pl-2.5 pr-8 text-sm text-foreground transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
