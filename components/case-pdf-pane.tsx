'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_SETTLE_MS = 540;
const LOAD_TIMEOUT_MS = 12_000;

export function CasePdfPane({
  url,
  title,
  className,
  lockFrameSize = false,
  layoutSettleMs = DEFAULT_SETTLE_MS,
  layoutPulse = 0,
}: {
  url: string;
  title: string;
  className?: string;
  lockFrameSize?: boolean;
  /** Wait for grid open/close animation before a blank-PDF recovery nudge. */
  layoutSettleMs?: number;
  /** Bumps when outer layout changes (e.g. fullscreen) to recover a stuck PDF. */
  layoutPulse?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [reloadToken, setReloadToken] = useState(0);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const lockRef = useRef(lockFrameSize);
  const prevLockRef = useRef(lockFrameSize);
  const boxRef = useRef(box);
  const loadStateRef = useRef(loadState);
  const prevUrlRef = useRef(url);
  lockRef.current = lockFrameSize;
  boxRef.current = box;
  loadStateRef.current = loadState;

  const bumpReload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const nudgeIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.style.width = '100.01%';
    void iframe.getBoundingClientRect();
    iframe.style.width = '100%';
  }, []);

  const measure = useCallback(() => {
    const node = hostRef.current;
    if (!node || lockRef.current) return false;
    const rect = node.getBoundingClientRect();
    const width = Math.max(0, Math.floor(rect.width));
    const height = Math.max(0, Math.floor(rect.height));
    if (width < 8 || height < 8) return false;
    const prev = boxRef.current;
    if (prev.width === width && prev.height === height) return false;
    const next = { width, height };
    boxRef.current = next;
    setBox(next);
    return true;
  }, []);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    if (prevUrlRef.current === url) return;
    prevUrlRef.current = url;
    setLoadState('loading');
    bumpReload();
  }, [bumpReload, url]);

  useEffect(() => {
    const wasLocked = prevLockRef.current;
    prevLockRef.current = lockFrameSize;
    if (lockFrameSize || !wasLocked) return;

    const raf = requestAnimationFrame(() => {
      measure();
    });
    const settleTimer = window.setTimeout(() => {
      measure();
      nudgeIframe();
      if (loadStateRef.current === 'error' && boxRef.current.width >= 8) {
        setLoadState('loading');
        bumpReload();
      }
    }, layoutSettleMs);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [bumpReload, layoutSettleMs, lockFrameSize, measure, nudgeIframe]);

  useEffect(() => {
    if (lockFrameSize || layoutPulse === 0) return;
    const raf = requestAnimationFrame(() => {
      measure();
    });
    const settleTimer = window.setTimeout(() => {
      measure();
      nudgeIframe();
      if (loadStateRef.current === 'error' && boxRef.current.width >= 8) {
        setLoadState('loading');
        bumpReload();
      }
    }, layoutSettleMs);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settleTimer);
    };
  }, [bumpReload, layoutPulse, layoutSettleMs, lockFrameSize, measure, nudgeIframe]);

  useEffect(() => {
    if (box.width < 8 || box.height < 8) return;
    if (loadStateRef.current !== 'idle') return;
    setLoadState('loading');
  }, [box.height, box.width]);

  useEffect(() => {
    if (lockFrameSize || box.width < 8 || box.height < 8) return;
    if (loadState !== 'loading') return;

    const timer = window.setTimeout(() => {
      setLoadState((state) => (state === 'loading' ? 'error' : state));
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [box.height, box.width, loadState, lockFrameSize, reloadToken]);

  const showIframe = box.width > 0 && box.height > 0;
  const showLoading = showIframe && !lockFrameSize && loadState === 'loading';
  const showError = showIframe && !lockFrameSize && loadState === 'error';

  return (
    <div
      ref={hostRef}
      className={cn(
        'relative h-full min-h-0 min-w-0 overflow-hidden overscroll-contain bg-white',
        lockFrameSize && 'pointer-events-none',
        className,
      )}
    >
      {showIframe ? (
        <iframe
          key={reloadToken}
          ref={iframeRef}
          src={`${url}#view=FitH`}
          title={title}
          width={box.width}
          height={box.height}
          className="absolute inset-0 block h-full w-full border-0 bg-white"
          onLoad={() => setLoadState('ready')}
          onError={() => setLoadState('error')}
        />
      ) : null}

      {showLoading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80">
          <p className="text-sm text-muted-foreground">Loading case PDF…</p>
        </div>
      ) : null}

      {showError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
          <p className="text-sm text-muted-foreground">
            The case PDF did not load. Your interview notes are still saved.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="normal-case"
            onClick={() => {
              setLoadState('loading');
              measure();
              bumpReload();
            }}
          >
            Retry PDF
          </Button>
        </div>
      ) : null}
    </div>
  );
}
