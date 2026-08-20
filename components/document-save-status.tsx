'use client';

import { CheckIcon, CloudIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DocumentSaveStatus = 'saved' | 'saving' | 'dirty' | 'invalid' | 'error';

const copy: Record<
  DocumentSaveStatus,
  { label: string; className: string; icon: typeof CheckIcon }
> = {
  saved: {
    label: 'All changes saved',
    className: 'text-muted-foreground',
    icon: CheckIcon,
  },
  saving: {
    label: 'Saving changes…',
    className: 'text-muted-foreground',
    icon: Loader2Icon,
  },
  dirty: {
    label: 'Unsaved changes',
    className: 'text-amber-700 dark:text-amber-400',
    icon: CloudIcon,
  },
  invalid: {
    label: 'Complete required fields to save',
    className: 'text-muted-foreground',
    icon: CloudIcon,
  },
  error: {
    label: "Couldn't save",
    className: 'text-destructive',
    icon: TriangleAlertIcon,
  },
};

export function DocumentSaveStatusLine({
  status,
  errorMessage,
  className,
  savedLabel,
}: {
  status: DocumentSaveStatus;
  errorMessage?: string;
  className?: string;
  savedLabel?: string;
}) {
  const meta = copy[status];
  const Icon = meta.icon;
  const label =
    status === 'error' && errorMessage
      ? errorMessage
      : status === 'saved'
        ? (savedLabel ?? meta.label)
        : meta.label;

  return (
    <p
      className={cn(
        'inline-flex items-center gap-1.5 text-xs sm:text-sm',
        meta.className,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={cn('size-3.5 shrink-0', status === 'saving' && 'animate-spin')}
        aria-hidden
      />
      <span>{label}</span>
    </p>
  );
}
