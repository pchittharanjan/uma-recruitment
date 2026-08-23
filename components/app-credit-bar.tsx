'use client';

import { useEffect, useState } from 'react';
import { formatLastUpdated } from '@/lib/last-updated';
import { cn } from '@/lib/utils';

const DEV_POLL_MS = 45_000;

export function AppCreditBar({ className }: { className?: string }) {
  const [lastUpdated, setLastUpdated] = useState(() => formatLastUpdated());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch('/api/last-updated', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { lastUpdated?: string };
        if (!cancelled && data.lastUpdated) {
          setLastUpdated(formatLastUpdated(data.lastUpdated));
        }
      } catch {
        // Keep the last known / build-time value.
      }
    };

    void load();

    const pollId =
      process.env.NODE_ENV === 'development'
        ? window.setInterval(() => {
            void load();
          }, DEV_POLL_MS)
        : undefined;

    return () => {
      cancelled = true;
      if (pollId !== undefined) window.clearInterval(pollId);
    };
  }, []);

  return (
    <footer
      data-interview-chrome=""
      className={cn(
        // ::before top rule (not border-t) so h-8 flex centering isn't shifted by the
        // border box. Half-pixel nudge offsets Absans sitting low in its em box.
        'relative flex h-8 shrink-0 items-center justify-between gap-4 bg-muted/40 px-5 sm:px-8',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-border',
        'font-heading text-[11px] leading-none text-muted-foreground sm:text-xs',
        className,
      )}
    >
      <span className="min-w-0 truncate leading-none -translate-y-[0.5px]">
        Built By Pranav Chittharanjan
      </span>
      <span className="shrink-0 leading-none -translate-y-[0.5px]">
        Last Updated: {lastUpdated}
      </span>
    </footer>
  );
}
