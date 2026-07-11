'use client';

import { useState } from 'react';
import {
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Type = 'success' | 'error' | 'info' | 'warning';

const styles: Record<Type, { alert: string; icon: string }> = {
  success: {
    alert: 'border-emerald-500/25 bg-emerald-500/5',
    icon: 'text-emerald-600 dark:text-emerald-500',
  },
  error: {
    alert: 'border-destructive/30 bg-destructive/5 text-destructive',
    icon: 'text-destructive',
  },
  info: {
    alert: 'border-border/80 bg-muted/40',
    icon: 'text-muted-foreground',
  },
  warning: {
    alert: 'border-amber-500/25 bg-amber-500/5',
    icon: 'text-amber-600 dark:text-amber-500',
  },
};

const icons: Record<Type, typeof InfoIcon> = {
  success: CheckCircle2Icon,
  error: TriangleAlertIcon,
  info: InfoIcon,
  warning: TriangleAlertIcon,
};

function readDismissed(key: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function persistDismissed(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // ignore quota / private mode
  }
}

export default function StatusBanner({
  message,
  type = 'info',
  title,
  dismissKey,
}: {
  message: string;
  type?: Type;
  title?: string;
  /** When set, banner can be dismissed and stays hidden via localStorage. */
  dismissKey?: string;
}) {
  const [dismissed, setDismissed] = useState(() =>
    dismissKey ? readDismissed(dismissKey) : false,
  );

  if (dismissKey && dismissed) return null;

  const Icon = icons[type];
  const content = title ? (
    <>
      <span className="font-medium">{title}</span>
      <span className="text-muted-foreground"> {message}</span>
    </>
  ) : (
    message
  );

  return (
    <Alert
      className={cn(
        'grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-0 border py-2 pr-10 pl-3 text-sm shadow-none',
        styles[type].alert,
        dismissKey && 'has-data-[slot=alert-action]:pr-10',
      )}
    >
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', styles[type].icon)} aria-hidden />
      <AlertDescription className="col-start-2 text-sm leading-snug text-foreground">
        {content}
      </AlertDescription>
      {dismissKey && (
        <AlertAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss notification"
            onClick={() => {
              persistDismissed(dismissKey);
              setDismissed(true);
            }}
          >
            <XIcon />
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}
