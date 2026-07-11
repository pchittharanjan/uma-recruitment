'use client';

import { cn } from '@/lib/utils';

export function StepTransition({
  stepKey,
  direction = 'forward',
  children,
  className,
}: {
  stepKey: string;
  direction?: 'forward' | 'back';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      key={stepKey}
      className={cn(
        'animate-in fade-in-0 duration-300 ease-out fill-mode-both motion-reduce:animate-none',
        direction === 'forward' ? 'slide-in-from-right-2' : 'slide-in-from-left-2',
        className,
      )}
    >
      {children}
    </div>
  );
}
