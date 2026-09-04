'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export type StatusBannerAction = { label: string; href: string };

export default function StatusBanner({
  message,
  type = 'info',
  title,
  dismissKey,
  actionLabel,
  actionHref,
  actions,
}: {
  message: string;
  type?: Type;
  title?: string;
  /** When set, banner can be dismissed and stays hidden via localStorage. */
  dismissKey?: string;
  actionLabel?: string;
  actionHref?: string;
  /** Prefer over actionLabel/actionHref when multiple CTAs are needed. */
  actions?: StatusBannerAction[];
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

  const resolvedActions: StatusBannerAction[] =
    actions && actions.length > 0
      ? actions
      : actionLabel && actionHref
        ? [{ label: actionLabel, href: actionHref }]
        : [];
  const hasAction = resolvedActions.length > 0;

  return (
    <Alert
      className={cn(
        'grid-cols-[auto_1fr_auto] items-center gap-x-2.5 gap-y-0 border py-2 pr-3 pl-3 text-sm shadow-none',
        styles[type].alert,
      )}
    >
      <Icon className={cn('!translate-y-0 size-3.5 shrink-0 self-center', styles[type].icon)} aria-hidden />
      <AlertDescription className="col-start-2 flex items-center text-sm leading-snug text-foreground">
        {content}
      </AlertDescription>
      {(dismissKey || hasAction) && (
        <div className="col-start-3 flex flex-wrap items-center justify-end gap-1">
          {resolvedActions.map((action) => (
            <Button
              key={`${action.href}:${action.label}`}
              nativeButton={false}
              render={
                <Link
                  href={action.href}
                  onClick={(event) => {
                    if (!action.href.startsWith('#')) return;
                    const id = action.href.slice(1);
                    const el = document.getElementById(id);
                    if (!el) return;
                    event.preventDefault();
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    if (window.location.hash !== action.href) {
                      window.history.replaceState(null, '', action.href);
                    }
                  }}
                />
              }
              variant="outline"
              size="xs"
              className="h-7"
            >
              {action.label}
            </Button>
          ))}
          {dismissKey ? (
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
              <XIcon className="!translate-y-0 size-3.5" />
            </Button>
          ) : null}
        </div>
      )}
    </Alert>
  );
}
