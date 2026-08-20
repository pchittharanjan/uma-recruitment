'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

let pendingNavigationListeners: Set<() => void> | null = null;

const MIN_VISIBLE_MS = 220;
const SAFETY_TIMEOUT_MS = 15000;
const LOADING_SELECTOR = [
  '[data-page-loading]',
  '[aria-busy="true"][aria-label="Loading"]',
  '[role="status"][aria-label="Loading"]',
].join(',');

/** Call before programmatic navigation (router.push) for instant feedback. */
export function markNavigationPending() {
  pendingNavigationListeners?.forEach((listener) => listener());
}

function pageContentStillLoading(): boolean {
  return Boolean(document.querySelector(LOADING_SELECTOR));
}

function locationHref(): string {
  return `${window.location.pathname}${window.location.search}`;
}

function normalizeHref(href: string): string {
  if (href.startsWith('?')) {
    return `${window.location.pathname}${href}`;
  }
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

export function NavigationProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const hrefAtStartRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const startPending = useCallback(() => {
    hrefAtStartRef.current = locationHref();
    startedAtRef.current = Date.now();
    setPending(true);
  }, []);

  const finishIfReady = useCallback(() => {
    if (hrefAtStartRef.current != null && hrefAtStartRef.current === locationHref()) {
      return;
    }
    if (pageContentStillLoading()) return;
    if (Date.now() - startedAtRef.current < MIN_VISIBLE_MS) return;
    hrefAtStartRef.current = null;
    setPending(false);
  }, []);

  useEffect(() => {
    if (!pending) return;

    let cancelled = false;
    const tryFinish = () => {
      if (!cancelled) finishIfReady();
    };

    // Wait two frames so the destination page can mount its loading UI
    // before we decide the navigation is done.
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(tryFinish);
    });

    const observer = new MutationObserver(tryFinish);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-page-loading', 'aria-busy', 'aria-label', 'role'],
    });

    const poll = window.setInterval(tryFinish, 80);
    const timeout = window.setTimeout(() => {
      hrefAtStartRef.current = null;
      setPending(false);
    }, SAFETY_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      observer.disconnect();
      window.clearInterval(poll);
      window.clearTimeout(timeout);
    };
  }, [pending, pathname, finishIfReady]);

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

      if (normalizeHref(rawHref) !== locationHref()) startPending();
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [startPending]);

  if (!mounted) return null;

  return createPortal(
    <div
      aria-hidden={!pending}
      data-pending={pending ? 'true' : 'false'}
      className="navigation-progress-bar"
    >
      <div className="navigation-progress-bar__indeterminate" />
    </div>,
    document.body,
  );
}
