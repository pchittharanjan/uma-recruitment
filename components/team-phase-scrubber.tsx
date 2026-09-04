'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASES } from '@/lib/stages';
import {
  phaseLabelForTeam,
  pipelinePhasesForTeam,
} from '@/lib/team-pipeline-profile';
import { teamDotClass, teamHexColors } from '@/lib/team-colors';
import { cn } from '@/lib/utils';

function scrubberStagesForTeam(teamName: string) {
  const phases = pipelinePhasesForTeam(teamName);
  const closed = PIPELINE_PHASES.find((p) => p.status === 'closed');
  return closed ? [...phases, closed] : phases;
}

function indexFromClientX(
  clientX: number,
  track: HTMLElement,
  stageCount: number,
): number {
  const rect = track.getBoundingClientRect();
  if (rect.width <= 0 || stageCount <= 1) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * (stageCount - 1));
}

export function TeamPhaseScrubber({
  teamName,
  status,
  nextStatus,
  canAdvance,
  canRevert,
  previousStatus,
  disabled = false,
  busy = false,
  isAdvancing = false,
  isReverting = false,
  onRequestAdvance,
  onRequestRevert,
  className,
}: {
  teamName: string;
  status: RoundStatus;
  nextStatus: RoundStatus | null;
  canAdvance: boolean;
  canRevert: boolean;
  previousStatus: RoundStatus | null;
  disabled?: boolean;
  busy?: boolean;
  isAdvancing?: boolean;
  isReverting?: boolean;
  onRequestAdvance: () => void;
  onRequestRevert: () => void;
  className?: string;
}) {
  const stages = scrubberStagesForTeam(teamName);
  const currentIndex = Math.max(
    0,
    stages.findIndex((s) => s.status === status),
  );
  const [previewIndex, setPreviewIndex] = useState(currentIndex);
  const [dragging, setDragging] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const labelId = useId();
  const colors = teamHexColors(teamName);
  const interactive = !disabled && !busy;
  const displayIndex = dragging ? previewIndex : currentIndex;
  const displayStatus = stages[displayIndex]?.status ?? status;
  const progress =
    stages.length <= 1 ? 0 : (displayIndex / (stages.length - 1)) * 100;

  useEffect(() => {
    if (!dragging) setPreviewIndex(currentIndex);
  }, [currentIndex, dragging]);

  const commitPreview = (index: number) => {
    setDragging(false);
    pointerIdRef.current = null;
    setPreviewIndex(currentIndex);

    if (index === currentIndex) return;

    if (index > currentIndex) {
      if (!canAdvance || !nextStatus) {
        toast.message('This team is already at the latest phase.');
        return;
      }
      if (index > currentIndex + 1) {
        toast.message('Phases move one step at a time. Confirm to advance.');
      }
      onRequestAdvance();
      return;
    }

    if (!canRevert || !previousStatus) {
      toast.message('This team cannot move back from the current phase.');
      return;
    }
    if (index < currentIndex - 1) {
      toast.message('Phases move one step at a time. Confirm to move back.');
    }
    onRequestRevert();
  };

  const beginDrag = (clientX: number, pointerId: number) => {
    if (!interactive || !trackRef.current) return;
    pointerIdRef.current = pointerId;
    setDragging(true);
    setPreviewIndex(indexFromClientX(clientX, trackRef.current, stages.length));
  };

  const moveDrag = (clientX: number) => {
    if (!dragging || !trackRef.current) return;
    setPreviewIndex(indexFromClientX(clientX, trackRef.current, stages.length));
  };

  const endDrag = (clientX: number | null) => {
    if (!dragging) return;
    const index =
      clientX != null && trackRef.current
        ? indexFromClientX(clientX, trackRef.current, stages.length)
        : previewIndex;
    commitPreview(index);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!interactive || !canRevert || !previousStatus}
          aria-busy={isReverting}
          aria-label={
            previousStatus
              ? `Move back to ${phaseLabelForTeam(previousStatus, teamName)}`
              : 'Move back'
          }
          className="size-8 shrink-0 px-0"
          onClick={() => {
            if (!canRevert || !previousStatus) return;
            onRequestRevert();
          }}
        >
          {isReverting ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowLeftIcon className="size-3.5 opacity-70" aria-hidden />
          )}
        </Button>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div
            ref={trackRef}
            role="slider"
            tabIndex={interactive ? 0 : -1}
            aria-labelledby={labelId}
            aria-valuemin={0}
            aria-valuemax={stages.length - 1}
            aria-valuenow={displayIndex}
            aria-valuetext={phaseLabelForTeam(displayStatus, teamName)}
            aria-disabled={!interactive}
            className={cn(
              'relative touch-none select-none rounded-full px-1 py-3.5 outline-none',
              interactive &&
                'cursor-grab focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing',
              !interactive && 'opacity-70',
            )}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              beginDrag(e.clientX, e.pointerId);
            }}
            onPointerMove={(e) => {
              if (pointerIdRef.current !== e.pointerId) return;
              moveDrag(e.clientX);
            }}
            onPointerUp={(e) => {
              if (pointerIdRef.current !== e.pointerId) return;
              endDrag(e.clientX);
            }}
            onPointerCancel={() => {
              setDragging(false);
              pointerIdRef.current = null;
              setPreviewIndex(currentIndex);
            }}
            onKeyDown={(e) => {
              if (!interactive) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (canAdvance && nextStatus) onRequestAdvance();
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                if (canRevert && previousStatus) onRequestRevert();
              } else if (e.key === 'Home') {
                e.preventDefault();
                if (canRevert && previousStatus) onRequestRevert();
              } else if (e.key === 'End') {
                e.preventDefault();
                if (canAdvance && nextStatus) onRequestAdvance();
              }
            }}
          >
            <div className="relative h-2 w-full rounded-full bg-muted-foreground/35">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150"
                style={{
                  width: `${progress}%`,
                  backgroundColor: colors.dot,
                }}
                aria-hidden
              />
              {stages.map((stage, index) => {
                const left =
                  stages.length <= 1 ? 50 : (index / (stages.length - 1)) * 100;
                const reached = index <= displayIndex;
                return (
                  <span
                    key={stage.status}
                    className={cn(
                      'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full',
                      reached
                        ? 'bg-background/90'
                        : 'border border-muted-foreground/55 bg-muted-foreground/50',
                    )}
                    style={{ left: `${left}%` }}
                    aria-hidden
                  />
                );
              })}
              <span
                className={cn(
                  'absolute top-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-background shadow-sm transition-[left] duration-150',
                  teamDotClass(teamName),
                  dragging && 'scale-110',
                )}
                style={{ left: `${progress}%` }}
                aria-hidden
              >
                {(isAdvancing || isReverting) && (
                  <Loader2 className="size-3 animate-spin text-white" />
                )}
              </span>
            </div>
          </div>

          <div className="flex justify-between gap-0.5 px-0.5 pt-0.5">
            {stages.map((stage, index) => {
              const active = index === displayIndex;
              const short =
                stage.status === 'pre_application'
                  ? 'Coffee'
                  : stage.shortLabel;
              return (
                <button
                  key={stage.status}
                  type="button"
                  disabled={!interactive}
                  title={phaseLabelForTeam(stage.status, teamName)}
                  className={cn(
                    'flex-1 overflow-visible whitespace-nowrap px-0 text-center text-[0.6rem] leading-snug transition-colors',
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground',
                    interactive && 'hover:text-foreground',
                  )}
                  onClick={() => {
                    if (!interactive) return;
                    commitPreview(index);
                  }}
                >
                  {short}
                </button>
              );
            })}
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!interactive || !canAdvance || !nextStatus}
          aria-busy={isAdvancing}
          aria-label={
            nextStatus
              ? nextStatus === 'closed'
                ? `Close ${teamName} cycle`
                : `Advance to ${phaseLabelForTeam(nextStatus, teamName)}`
              : 'Advance'
          }
          className="size-8 shrink-0 px-0"
          onClick={() => {
            if (!canAdvance || !nextStatus) return;
            onRequestAdvance();
          }}
        >
          {isAdvancing ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRightIcon className="size-3.5 opacity-70" aria-hidden />
          )}
        </Button>
      </div>

      <p id={labelId} className="text-xs leading-relaxed text-muted-foreground">
        {dragging ? (
          <>
            Release to{' '}
            {previewIndex > currentIndex
              ? `advance toward ${phaseLabelForTeam(displayStatus, teamName)}`
              : previewIndex < currentIndex
                ? `move back toward ${phaseLabelForTeam(displayStatus, teamName)}`
                : 'keep current phase'}
            . Confirm required.
          </>
        ) : nextStatus && canAdvance ? (
          <>
            Drag or use arrows to move. Next:{' '}
            <span className="font-medium text-foreground">
              {phaseLabelForTeam(nextStatus, teamName)}
            </span>
            .
          </>
        ) : status === 'closed' ? (
          <>This team cycle is closed.</>
        ) : (
          <>At {phaseLabelForTeam(status, teamName)}.</>
        )}
      </p>
    </div>
  );
}
