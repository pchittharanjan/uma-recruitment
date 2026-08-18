'use client';

import { CheckIcon, LockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASES, statusIndex, type UnlockableStage } from '@/lib/stages';

interface RecruitmentPhaseStepperProps {
  currentStatus: RoundStatus;
  selectedStatus?: RoundStatus;
  unlockedStages?: UnlockableStage[];
  /** admin/viewer reflect pipeline unlock state; browse is selection-only preview. */
  mode?: 'admin' | 'viewer' | 'browse';
  compact?: boolean;
  className?: string;
  onSelectPhase?: (status: RoundStatus) => void;
}

export function RecruitmentPhaseStepper({
  currentStatus,
  selectedStatus,
  unlockedStages = [],
  mode = 'viewer',
  compact = false,
  className,
  onSelectPhase,
}: RecruitmentPhaseStepperProps) {
  const isBrowse = mode === 'browse';
  const currentIdx = statusIndex(currentStatus);
  const activeSelection = selectedStatus ?? currentStatus;
  // After close, every prior stage stays browsable for admin (locks are grader-only).
  const unlockSet = new Set(
    currentStatus === 'closed'
      ? PIPELINE_PHASES.map((p) => p.unlockKey).filter(Boolean)
      : unlockedStages,
  );
  const interactive = (mode === 'admin' || isBrowse) && Boolean(onSelectPhase);

  return (
    <div className={cn('uma-scroll-strip w-full', className)}>
      <ol
        className={cn(
          'uma-scroll-strip-inner flex-nowrap items-center',
          compact ? 'gap-0.5' : 'gap-1',
        )}
      >
        {PIPELINE_PHASES.map((phase, index) => {
          const phaseIdx = statusIndex(phase.status);
          const isPipelineCurrent = phase.status === currentStatus;
          const isSelected = phase.status === activeSelection;
          const isPast = phaseIdx < currentIdx;
          const unlockKey = phase.unlockKey;
          const isUnlocked = unlockKey ? unlockSet.has(unlockKey) : true;
          const isFuture = phaseIdx > currentIdx;

          const isLocked = !isBrowse && mode === 'admin' && Boolean(unlockKey) && !isUnlocked;

          const pillClassName = cn(
            'flex shrink-0 items-center whitespace-nowrap rounded-lg border font-medium transition-colors',
            compact ? 'gap-1.5 px-2 py-0.5 text-xs' : 'gap-2 px-3 py-1.5 text-sm',
            isBrowse
              ? isSelected
                ? 'border-primary/40 bg-primary/12 text-primary'
                : 'border-border/70 bg-muted/30 text-muted-foreground'
              : [
                  isSelected && 'border-primary/40 bg-primary/12 text-primary',
                  !isSelected && isPipelineCurrent && 'border-primary/30 bg-primary/[0.07] text-primary',
                  !isSelected && isPast && 'border-border/70 bg-muted/40 text-muted-foreground',
                  !isSelected && isFuture && 'border-border/70 bg-muted/30 text-muted-foreground/80',
                  isLocked && !isSelected && !isPast && 'border-border/70 bg-muted/40',
                ],
            interactive && 'cursor-pointer hover:border-foreground/18 uma-hover-on-canvas',
          );

          const content = isBrowse ? (
            <>
              <span
                className={cn(
                  'shrink-0 rounded-full',
                  compact ? 'size-1.5' : 'size-2',
                  isSelected ? 'bg-primary' : 'bg-muted-foreground/45',
                )}
                aria-hidden
              />
              <span>{phase.label}</span>
            </>
          ) : (
            <>
              {isPast && !isPipelineCurrent ? (
                <CheckIcon
                  className={cn('shrink-0 text-green-600', compact ? 'size-3' : 'size-3.5')}
                  aria-hidden
                />
              ) : isLocked ? (
                <LockIcon
                  className={cn('shrink-0 text-amber-600', compact ? 'size-3' : 'size-3.5')}
                  aria-hidden
                />
              ) : (
                <span
                  className={cn(
                    'shrink-0 rounded-full',
                    compact ? 'size-1.5' : 'size-2',
                    isPipelineCurrent
                      ? 'bg-primary'
                      : isPast
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/45',
                  )}
                />
              )}
              <span>{phase.label}</span>
            </>
          );

          return (
            <li key={phase.status} className={cn('flex items-center', compact ? 'gap-0.5' : 'gap-1')}>
              {interactive ? (
                <button
                  type="button"
                  className={pillClassName}
                  aria-pressed={isSelected}
                  onClick={() => onSelectPhase?.(phase.status)}
                >
                  {content}
                </button>
              ) : (
                <div className={pillClassName}>{content}</div>
              )}
              {index < PIPELINE_PHASES.length - 1 && (
                <span className="px-0.5 text-foreground/45" aria-hidden>
                  →
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
