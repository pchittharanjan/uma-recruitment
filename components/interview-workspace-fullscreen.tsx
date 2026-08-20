'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Maximize2Icon, Minimize2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function useInterviewWorkspaceFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);

  const exit = useCallback(() => setFullscreen(false), []);
  const toggle = useCallback(() => setFullscreen((value) => !value), []);

  useEffect(() => {
    if (!fullscreen) return;

    const root = document.documentElement;
    root.setAttribute('data-interview-fullscreen', '');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setFullscreen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      root.removeAttribute('data-interview-fullscreen');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [fullscreen]);

  return { fullscreen, exit, toggle };
}

export function InterviewWorkspaceFullscreenButton({
  fullscreen,
  onToggle,
  className,
}: {
  fullscreen: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const label = fullscreen ? 'Exit fullscreen' : 'Fullscreen';

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'h-8 normal-case border-foreground/25 bg-background font-medium',
        className,
      )}
      aria-pressed={fullscreen}
      title={label}
      onClick={onToggle}
    >
      {fullscreen ? (
        <Minimize2Icon data-icon="inline-start" />
      ) : (
        <Maximize2Icon data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}

export function InterviewWorkspaceExitFullscreenButton({
  onExit,
  className,
}: {
  onExit: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className={cn(
        'h-8 border border-border bg-background font-medium shadow-sm normal-case',
        className,
      )}
      title="Exit fullscreen (Esc)"
      onClick={onExit}
    >
      <Minimize2Icon data-icon="inline-start" />
      Exit fullscreen
    </Button>
  );
}

export function InterviewStickyLead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    const fill = node?.closest('[data-interview-fill]') ?? node?.parentElement;
    if (!node || !fill || !(fill instanceof HTMLElement)) return;

    const apply = () => {
      fill.style.setProperty(
        '--interview-sticky-lead-height',
        `${node.getBoundingClientRect().height}px`,
      );
    };
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    apply();
    return () => {
      observer.disconnect();
      fill.style.removeProperty('--interview-sticky-lead-height');
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn('sticky top-0 z-20 bg-background', className)}
    >
      {children}
    </div>
  );
}

export function InterviewFullscreenEvalBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-interview-eval-chrome=""
      className={cn(
        'flex shrink-0 items-center justify-end gap-3 bg-background px-5 py-2 sm:px-8 lg:px-10 xl:px-12 2xl:px-14',
        className,
      )}
    >
      {children}
    </div>
  );
}
