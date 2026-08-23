'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MOBILE_BREAKPOINT = 640;

function clampWidth(width: number, viewportWidth: number, minWidth: number, maxRatio: number): number {
  if (viewportWidth < MOBILE_BREAKPOINT) {
    return viewportWidth;
  }
  const max = Math.round(viewportWidth * maxRatio);
  const min = Math.min(minWidth, max);
  return Math.min(max, Math.max(min, Math.round(width)));
}

function readStoredWidth(storageKey: string | undefined, fallback: number): number {
  if (typeof window === 'undefined' || !storageKey) return fallback;
  const raw = window.localStorage.getItem(storageKey);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ResizableSidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = 'right',
  storageKey,
  defaultWidth = 540,
  minWidth = 320,
  maxWidthRatio = 0.92,
  className,
  contentClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: 'left' | 'right';
  storageKey?: string;
  defaultWidth?: number;
  minWidth?: number;
  maxWidthRatio?: number;
  className?: string;
  contentClassName?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [entered, setEntered] = useState(false);

  const applyClamp = useCallback(
    (next: number) => {
      const vw = typeof window === 'undefined' ? 1200 : window.innerWidth;
      return clampWidth(next, vw, minWidth, maxWidthRatio);
    },
    [maxWidthRatio, minWidth],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const preferred = readStoredWidth(storageKey, defaultWidth);
    const next = applyClamp(preferred);
    setWidth(next);
    setIsMobile(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, [open, storageKey, defaultWidth, applyClamp]);

  useEffect(() => {
    if (!open) return;

    const onResize = () => {
      const vw = window.innerWidth;
      setIsMobile(vw < MOBILE_BREAKPOINT);
      setWidth((prev) => clampWidth(prev, vw, minWidth, maxWidthRatio));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open, minWidth, maxWidthRatio]);

  useEffect(() => {
    if (!dragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onOpenChange(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const focusable = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [open]);

  const persistWidth = (next: number) => {
    if (!storageKey || typeof window === 'undefined') return;
    if (window.innerWidth < MOBILE_BREAKPOINT) return;
    window.localStorage.setItem(storageKey, String(next));
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || isMobile) return;
    event.preventDefault();
    dragRef.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const raw = side === 'right' ? drag.startWidth - delta : drag.startWidth + delta;
    setWidth(applyClamp(raw));
  };

  const onResizePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) return;
    const delta = event.clientX - drag.startX;
    const raw = side === 'right' ? drag.startWidth - delta : drag.startWidth + delta;
    const next = applyClamp(raw);
    setWidth(next);
    persistWidth(next);
  };

  if (!mounted || !open) return null;

  const panelStyle: CSSProperties = {
    width: isMobile ? '100vw' : width,
    maxWidth: isMobile ? '100vw' : `${Math.round(maxWidthRatio * 100)}vw`,
    transition: dragging ? 'none' : 'transform 200ms ease-out, opacity 150ms ease-out',
  };

  return createPortal(
    <div className="fixed inset-0 z-50" data-slot="resizable-side-panel">
      <button
        type="button"
        aria-label="Close panel"
        className={cn(
          'absolute inset-0 border-0 bg-black/10 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs',
          entered ? 'opacity-100' : 'opacity-0',
        )}
        onClick={() => onOpenChange(false)}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        data-side={side}
        className={cn(
          '@container fixed inset-y-0 z-50 flex h-full flex-col bg-popover text-sm text-popover-foreground shadow-lg',
          side === 'right'
            ? 'right-0 border-l sm:rounded-l-xl'
            : 'left-0 border-r sm:rounded-r-xl',
          side === 'right' && (entered ? 'translate-x-0' : 'translate-x-4'),
          side === 'left' && (entered ? 'translate-x-0' : '-translate-x-4'),
          entered ? 'opacity-100' : 'opacity-0',
          className,
        )}
        style={panelStyle}
      >
        {!isMobile && (
          <button
            type="button"
            aria-label="Drag to resize panel"
            className={cn(
              'group absolute inset-y-0 z-20 w-3 cursor-ew-resize border-0 bg-transparent p-0',
              'focus-visible:outline-none',
              side === 'right' ? 'left-0' : 'right-0',
            )}
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
          >
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute inset-y-0 w-px transition-colors',
                side === 'right' ? 'left-0' : 'right-0',
                'bg-transparent group-hover:bg-border group-focus-visible:bg-border',
                dragging && 'bg-muted-foreground/35',
              )}
            />
          </button>
        )}

        {(title || description) && (
          <div className="shrink-0 space-y-1 border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
            {title ? (
              <h2 id={titleId} className="truncate font-heading text-lg font-medium text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p id={descriptionId} className="truncate text-sm text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3 z-30"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        >
          <XIcon />
        </Button>

        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', contentClassName)}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
