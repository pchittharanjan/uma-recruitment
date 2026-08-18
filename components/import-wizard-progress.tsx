'use client';

import { CheckIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type WizardStepId = 'upload' | 'teams' | 'scoring' | 'graders' | 'confirm';

const WIZARD_STEPS: ReadonlyArray<{ id: WizardStepId; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'teams', label: 'Teams' },
  { id: 'scoring', label: 'Review' },
  { id: 'graders', label: 'Users' },
  { id: 'confirm', label: 'Confirm' },
];

export const WIZARD_STEP_IDS = WIZARD_STEPS.map((step) => step.id);

/** Used as the dynamic-import fallback while wizard step labels hydrate. */
export function ImportWizardProgressPlaceholder() {
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="status"
      aria-label="Loading"
    >
      {WIZARD_STEPS.map((step) => (
        <div key={step.id} className="flex items-center gap-2">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-14" />
        </div>
      ))}
    </div>
  );
}

export default function ImportWizardProgress({
  currentStepId,
}: {
  currentStepId: WizardStepId;
}) {
  const currentStepIndex = WIZARD_STEP_IDS.indexOf(currentStepId);

  return (
    <nav aria-label="Import steps" className="w-full">
      <ol className="flex flex-wrap items-center gap-y-2">
        {WIZARD_STEPS.map((wizardStep, i) => {
          const isComplete = currentStepIndex > i;
          const isCurrent = currentStepId === wizardStep.id;

          return (
            <li key={wizardStep.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    isCurrent && 'bg-primary text-primary-foreground',
                    isComplete && !isCurrent && 'bg-emerald-600 text-white',
                    !isCurrent && !isComplete && 'bg-muted text-muted-foreground',
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isComplete && !isCurrent ? (
                    <CheckIcon className="size-3.5" aria-hidden />
                  ) : (
                    i + 1
                  )}
                </span>
                <span
                  className={cn(
                    'text-sm',
                    isCurrent && 'font-semibold text-foreground',
                    !isCurrent && 'text-muted-foreground',
                  )}
                >
                  {wizardStep.label}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'mx-3 h-px w-6 sm:w-10',
                    isComplete ? 'bg-emerald-500/50' : 'bg-border',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
