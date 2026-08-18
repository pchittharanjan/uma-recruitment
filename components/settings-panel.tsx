'use client';

import type { ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Compact control styling — matches NativeSelect in settings rows. */
export const settingsControlClass =
  'h-8 rounded-md border border-input bg-background text-sm shadow-none';

/** Fixed widths for settings rows (no flex-grow). */
export const settingsDateFieldWidth = 'w-[10.5rem]';
export const settingsTimeFieldWidth = 'w-[7.5rem]';

/** Compact collapsible settings card — same chrome as Recruitment Cycle. */
export function SettingsPanel({
  label,
  collapsedSummary,
  open,
  onOpenChange,
  loading = false,
  children,
  className,
}: {
  label: string;
  collapsedSummary?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('display-panel px-4 py-3', className)}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <div>
          <p className="uma-section-label">{label}</p>
          {!open && !loading && collapsedSummary ? (
            <p className="mt-1 text-sm font-medium text-foreground">{collapsedSummary}</p>
          ) : null}
        </div>
        <ChevronDownIcon
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>
      {open ? <div className="mt-3 space-y-2">{children}</div> : null}
    </div>
  );
}
