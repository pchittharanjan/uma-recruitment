'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { CasePdfPane } from '@/components/case-pdf-pane';
import { cn } from '@/lib/utils';

const STORAGE_RATIO_KEY = 'uma-interview-case-split-ratio';
const STORAGE_COLLAPSED_KEY = 'uma-interview-case-collapsed';
const DEFAULT_RATIO = 50;
const MIN_RATIO = 22;
const MAX_RATIO = 70;
const COLLAPSE_SNAP_RATIO = 16;
const STACK_BREAKPOINT = 1024;
const OPEN_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const OPEN_MS = 520;
export const GROUP_CANDIDATE_COLUMN_MIN_PX = 340;

function clampRatio(value: number): number {
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

function readStoredRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_RATIO;
  const raw = window.localStorage.getItem(STORAGE_RATIO_KEY);
  const value = raw ? Number.parseFloat(raw) : DEFAULT_RATIO;
  if (!Number.isFinite(value)) return DEFAULT_RATIO;
  return clampRatio(value);
}

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_COLLAPSED_KEY) === '1';
}

function persistCollapsedValue(collapsed: boolean) {
  window.localStorage.setItem(STORAGE_COLLAPSED_KEY, collapsed ? '1' : '0');
}

export function useInterviewCaseOpen(): [boolean, (open: boolean) => void] {
  const [caseOpen, setCaseOpenState] = useState(true);

  useEffect(() => {
    setCaseOpenState(!readStoredCollapsed());
  }, []);

  const setCaseOpen = useCallback((open: boolean) => {
    setCaseOpenState(open);
    persistCollapsedValue(!open);
  }, []);

  return [caseOpen, setCaseOpen];
}

export function groupCandidatesSideBySide(
  evalWidth: number,
  candidateCount: number,
): boolean {
  // Show the wrapping card grid whenever one candidate column can fit.
  // Do not require every candidate in a single 340px row (4 × 340 = 1360px).
  return candidateCount >= 2 && evalWidth >= GROUP_CANDIDATE_COLUMN_MIN_PX;
}

const GROUP_NOTES_PAD_X = 'px-4 sm:px-5 lg:px-5';
const GROUP_NOTES_PAD_TOP = 'pt-4 sm:pt-5 lg:pt-5';
const GROUP_NOTES_PAD_BOTTOM = 'pb-6 sm:pb-7 lg:pb-8';
const SINGLE_NOTES_PAD_X = 'px-6 sm:px-7 lg:px-8';
const SINGLE_NOTES_PAD_TOP = 'pt-6 sm:pt-7 lg:pt-8';
const SINGLE_NOTES_PAD_BOTTOM = 'pb-6 sm:pb-7 lg:pb-8';

export function InterviewCaseEvalSplit({
  caseUrl,
  caseTitle,
  notes,
  notesChrome,
  footer,
  candidateCount = 1,
  onSideBySideChange,
  caseOpen: caseOpenProp,
  onCaseOpenChange,
  fullscreen = false,
  className,
}: {
  caseUrl: string;
  caseTitle: string;
  notes: ReactNode;
  notesChrome?: ReactNode;
  footer?: ReactNode;
  candidateCount?: number;
  onSideBySideChange?: (sideBySide: boolean) => void;
  caseOpen?: boolean;
  onCaseOpenChange?: (open: boolean) => void;
  fullscreen?: boolean;
  className?: string;
}) {
  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const [stacked, setStacked] = useState(false);
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const evalRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startRatio: number } | null>(null);
  const ratioRef = useRef(ratio);
  const onSideBySideChangeRef = useRef(onSideBySideChange);
  const onCaseOpenChangeRef = useRef(onCaseOpenChange);
  const sideBySideRef = useRef(false);
  const isControlled = caseOpenProp !== undefined;

  ratioRef.current = ratio;
  onSideBySideChangeRef.current = onSideBySideChange;
  onCaseOpenChangeRef.current = onCaseOpenChange;

  const collapsed = isControlled ? !caseOpenProp : internalCollapsed;

  useEffect(() => {
    setRatio(readStoredRatio());
    if (!isControlled) {
      setInternalCollapsed(readStoredCollapsed());
    }
  }, [isControlled]);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${STACK_BREAKPOINT - 1}px)`);
    const sync = () => setStacked(mql.matches);
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, []);

  const persistRatio = useCallback((next: number) => {
    window.localStorage.setItem(STORAGE_RATIO_KEY, String(next));
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    persistCollapsedValue(next);
    if (!isControlled) {
      setInternalCollapsed(next);
    }
    onCaseOpenChangeRef.current?.(!next);
  }, [isControlled]);

  const hideCase = useCallback(() => {
    if (fullscreen) return;
    setCollapsed(true);
  }, [fullscreen, setCollapsed]);

  const reportSideBySide = useCallback((evalWidth: number) => {
    const next = groupCandidatesSideBySide(evalWidth, candidateCount);
    if (sideBySideRef.current === next) return;
    sideBySideRef.current = next;
    onSideBySideChangeRef.current?.(next);
  }, [candidateCount]);

  useEffect(() => {
    const node = evalRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? node.getBoundingClientRect().width;
      reportSideBySide(width);
    });
    observer.observe(node);
    reportSideBySide(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [reportSideBySide, collapsed, stacked]);

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag) return;
    const parent = splitRef.current;
    if (!parent) return;
    const raw = drag.startRatio + ((event.clientX - drag.startX) / parent.clientWidth) * 100;
    if (raw <= COLLAPSE_SNAP_RATIO) {
      if (fullscreen) {
        const next = clampRatio(MIN_RATIO);
        setRatio(next);
        persistRatio(next);
        return;
      }
      hideCase();
      return;
    }
    const next = clampRatio(raw);
    setRatio(next);
    persistRatio(next);
  };

  const caseVisible = !collapsed;
  const caseTrack = caseVisible ? `${ratio}%` : '0%';
  const gutterTrack = caseVisible ? '6px' : '0px';
  const [layoutPulse, setLayoutPulse] = useState(0);
  const prevFullscreenRef = useRef(fullscreen);

  useEffect(() => {
    if (prevFullscreenRef.current === fullscreen) return;
    prevFullscreenRef.current = fullscreen;
    if (!caseVisible) return;
    setLayoutPulse((value) => value + 1);
  }, [caseVisible, fullscreen]);

  const groupNotes = candidateCount >= 2;
  const panelBg = groupNotes ? 'bg-[#f7f4ef]' : 'bg-surface-panel';
  const padX = groupNotes ? GROUP_NOTES_PAD_X : SINGLE_NOTES_PAD_X;
  const padTop = groupNotes ? GROUP_NOTES_PAD_TOP : SINGLE_NOTES_PAD_TOP;
  const padBottom = groupNotes ? GROUP_NOTES_PAD_BOTTOM : SINGLE_NOTES_PAD_BOTTOM;

  return (
    <div
      ref={splitRef}
      data-interview-workspace=""
      data-interview-case={caseVisible ? 'open' : 'closed'}
      className={cn(
        'grid h-0 min-h-0 w-full flex-1 overflow-hidden rounded-xl @container',
        panelBg,
        className,
      )}
      style={{
        transitionProperty: dragging ? 'none' : 'grid-template-columns, grid-template-rows',
        transitionDuration: dragging ? '0ms' : `${OPEN_MS}ms`,
        transitionTimingFunction: OPEN_EASE,
        ...(stacked
          ? {
              gridTemplateColumns: 'minmax(0, 1fr)',
              gridTemplateRows: caseVisible ? '42vh minmax(0, 1fr)' : '0vh minmax(0, 1fr)',
            }
          : {
              gridTemplateColumns: `${caseTrack} ${gutterTrack} minmax(0, 1fr)`,
              gridTemplateRows: 'minmax(0, 1fr)',
            }),
      }}
    >
      <div
        className={cn(
          'h-full min-h-0 min-w-0 overflow-hidden',
          !caseVisible && 'pointer-events-none',
        )}
        aria-hidden={!caseVisible}
      >
        {/* Keep the PDF at last-open size while the grid track animates to 0 so Chrome never sees a 0× iframe. */}
        <div
          className="h-full min-h-0 overflow-hidden"
          style={
            stacked
              ? { height: '42vh', width: '100%' }
              : { width: `${ratio}cqw`, height: '100%' }
          }
        >
          <CasePdfPane
            url={caseUrl}
            title={caseTitle}
            lockFrameSize={!caseVisible}
            layoutSettleMs={OPEN_MS}
            layoutPulse={layoutPulse}
            className={cn(
              'h-full min-h-0 border-0 lg:border-0',
              stacked && 'border-b border-border/20',
            )}
          />
        </div>
      </div>

      {stacked ? null : (
        <button
          type="button"
          aria-label="Drag to resize case panel. Double-click to hide."
          title="Drag to resize. Double-click to hide the case."
          className={cn(
            'relative min-h-0 touch-none bg-border/80 hover:bg-primary/60',
            caseVisible ? 'cursor-ew-resize' : 'pointer-events-none',
          )}
          tabIndex={caseVisible ? undefined : -1}
          aria-hidden={!caseVisible}
          onPointerDown={(event) => {
            if (event.button !== 0 || !caseVisible) return;
            event.preventDefault();
            setDragging(true);
            dragRef.current = { startX: event.clientX, startRatio: ratioRef.current };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag) return;
            const parent = splitRef.current;
            if (!parent) return;
            const raw =
              drag.startRatio + ((event.clientX - drag.startX) / parent.clientWidth) * 100;
            if (raw <= COLLAPSE_SNAP_RATIO) return;
            setRatio(clampRatio(raw));
          }}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onDoubleClick={hideCase}
        />
      )}

      <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        {notesChrome ? (
          <div
            data-group-interview-chrome=""
            className={cn('z-10 shrink-0', panelBg, padX, padTop, 'pb-3')}
          >
            {notesChrome}
          </div>
        ) : null}
        <div
          ref={evalRef}
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            padX,
            padBottom,
            notesChrome ? 'pt-0' : padTop,
          )}
        >
          {notes}
        </div>
        {footer ? <div className="shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
