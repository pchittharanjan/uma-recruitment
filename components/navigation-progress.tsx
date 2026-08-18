'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

let pendingNavigationListeners: Set<() => void> | null = null;

/** Call before programmatic navigation (router.push) for instant feedback. */
export function markNavigationPending() {
  pendingNavigationListeners?.forEach((listener) => listener());
}

function pageContentStillLoading(): boolean {
  return Boolean(document.querySelector('[data-page-loading]'));
}

function normalizeHref(href: string): string {
  if (href.startsWith('?')) return href;
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [pending, setPending] = useState(false);
  const hrefAtStartRef = useRef<string | null>(null);

  const currentHref = `${pathname}${search ? `?${search}` : ''}`;

  const startPending = useCallback(() => {
    hrefAtStartRef.current = currentHref;
    setPending(true);
  }, [currentHref]);

  const finishIfReady = useCallback(() => {
    const startedOn = hrefAtStartRef.current;
    if (startedOn != null && startedOn === currentHref) return;
    if (pageContentStillLoading()) return;
    hrefAtStartRef.current = null;
    setPending(false);
  }, [currentHref]);

  useEffect(() => {
    if (!pending) return;

    const observer = new MutationObserver(finishIfReady);
    observer.observe(document.body, { childList: true, subtree: true });
    finishIfReady();

    const timeout = window.setTimeout(() => {
      hrefAtStartRef.current = null;
      setPending(false);
    }, 15000);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [pending, currentHref, finishIfReady]);

  useEffect(() => {
    pendingNavigationListeners = new Set([startPending]);
    return () => {
      pendingNavigationListeners = null;
    };
  }, [startPending]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const anchor = (event.target as HTMLElement | null)?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) {
        return;
      }
      if (/^https?:\/\//i.test(rawHref) && !rawHref.startsWith(window.location.origin)) return;

      const nextHref = normalizeHref(rawHref);
      if (nextHref !== currentHref) startPending();
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [currentHref, startPending]);

  return (
    <div
      aria-hidden={!pending}
      className={cn(
        'pointer-events-none fixed inset-x-0 top-0 z-[100] h-[5px] overflow-hidden',
        pending ? 'opacity-100' : 'opacity-0',
        'transition-opacity duration-200',
      )}
    >
      <div
        className={cn(
          'h-full w-1/3 bg-primary',
          pending && 'animate-[navigation-progress_0.9s_ease-in-out_infinite]',
        )}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
