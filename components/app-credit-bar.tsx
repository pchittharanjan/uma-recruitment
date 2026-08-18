'use client';

import { useEffect, useState } from 'react';
import { formatLastUpdated } from '@/lib/last-updated';
import { cn } from '@/lib/utils';

export function AppCreditBar({ className }: { className?: string }) {
  const [lastUpdated, setLastUpdated] = useState(() => formatLastUpdated());

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch('/api/last-updated', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { lastUpdated?: string } | null) => {
          if (cancelled || !json?.lastUpdated) return;
          setLastUpdated(formatLastUpdated(json.lastUpdated));
        })
        .catch(() => {});
    };

    load();
    window.addEventListener('focus', load);
    const interval = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', load);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <footer
      className={cn(
        'flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-muted/40 px-5 sm:px-8',
        'font-heading text-[11px] leading-none text-muted-foreground sm:text-xs',
        className,
      )}
    >
      <p className="flex min-w-0 items-center truncate leading-none">
        Built By Pranav Chittharanjan
      </p>
      <p className="flex shrink-0 items-center leading-none">
        Last Updated: {lastUpdated}
      </p>
    </footer>
  );
}
