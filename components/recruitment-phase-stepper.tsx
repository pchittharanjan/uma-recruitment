'use client';

import { CheckIcon, LockIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASES, statusIndex, type UnlockableStage } from '@/lib/stages';

interface RecruitmentPhaseStepperProps {
  currentStatus: RoundStatus;
  selectedStatus?: RoundStatus;
  unlockedStages?: UnlockableStage[];
  mode?: 'admin' | 'viewer';
  className?: string;
  onSelectPhase?: (status: RoundStatus) => void;
}

export function RecruitmentPhaseStepper({
  currentStatus,
  selectedStatus,
  unlockedStages = [],
  mode = 'viewer',
  className,
  onSelectPhase,
}: RecruitmentPhaseStepperProps) {
  const currentIdx = statusIndex(currentStatus);
  const activeSelection = selectedStatus ?? currentStatus;
  // After close, every prior stage stays browsable for admin (locks are grader-only).
  const unlockSet = new Set(
    currentStatus === 'closed'
      ? PIPELINE_PHASES.map((p) => p.unlockKey).filter(Boolean)
      : unlockedStages,
  );
  const interactive = mode === 'admin' && Boolean(onSelectPhase);

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <ol className="flex min-w-max items-center gap-1">
        {PIPELINE_PHASES.map((phase, index) => {
          const phaseIdx = statusIndex(phase.status);
          const isPipelineCurrent = phase.status === currentStatus;
          const isSelected = phase.status === activeSelection;
          const isPast = phaseIdx < currentIdx;
          const unlockKey = phase.unlockKey;
          const isUnlocked = unlockKey ? unlockSet.has(unlockKey) : true;
          const isFuture = phaseIdx > currentIdx;

          const pillClassName = cn(
            'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            isSelected && 'bg-primary/12 text-primary',
            !isSelected && isPipelineCurrent && 'bg-primary/[0.07] text-primary',
            !isSelected && isPast && 'bg-muted/55 text-muted-foreground',
            !isSelected && isFuture && 'text-muted-foreground/70',
            interactive && 'cursor-pointer hover:bg-muted/60',
          );

          const content = (
            <>
              {isPast && !isPipelineCurrent ? (
                <CheckIcon className="size-3.5 shrink-0 text-green-600" aria-hidden />
              ) : mode === 'admin' && unlockKey && !isUnlocked ? (
                <LockIcon className="size-3.5 shrink-0 text-amber-600" aria-hidden />
              ) : (
                <span
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    isPipelineCurrent
                      ? 'bg-primary'
                      : isPast
                        ? 'bg-green-500'
                        : 'bg-muted-foreground/30',
                  )}
                />
              )}
              <span>{phase.label}</span>
            </>
          );

          return (
            <li key={phase.status} className="flex items-center gap-1">
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
                <span className="text-muted-foreground/40" aria-hidden>
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
