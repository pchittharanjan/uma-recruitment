import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';

export function NativeSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <div
      className={cn(
        'relative inline-flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-background transition-colors',
        'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        className,
      )}
    >
      <select
        className="h-full w-full min-w-0 appearance-none bg-transparent py-1 pl-2.5 pr-8 text-sm text-foreground outline-none disabled:cursor-not-allowed"
        {...props}
      />
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
