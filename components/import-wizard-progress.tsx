'use client';

export type WizardStepId = 'upload' | 'teams' | 'scoring' | 'graders' | 'confirm';

const WIZARD_STEPS: ReadonlyArray<{ id: WizardStepId; label: string }> = [
  { id: 'upload', label: 'Upload' },
  { id: 'teams', label: 'Teams' },
  { id: 'scoring', label: 'Review' },
  { id: 'graders', label: 'Users' },
  { id: 'confirm', label: 'Confirm' },
];

export const WIZARD_STEP_IDS = WIZARD_STEPS.map((step) => step.id);

/** Fixed layout shell — used as dynamic import loading fallback (no SSR for live labels). */
export function ImportWizardProgressPlaceholder() {
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm"
      aria-hidden
    >
      {WIZARD_STEPS.map((wizardStep, i) => (
        <div key={wizardStep.id} className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
            {i + 1}
          </div>
          <span className="min-w-[3.5rem]">
            <span className="inline-block h-4 w-14 rounded-sm bg-muted" />
          </span>
          {i < WIZARD_STEPS.length - 1 && (
            <span className="text-muted-foreground/40">→</span>
          )}
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
    <div className="mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
      {WIZARD_STEPS.map((wizardStep, i) => {
        const isComplete = currentStepIndex > i;
        const isCurrent = currentStepId === wizardStep.id;

        return (
          <div key={wizardStep.id} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300 ${
                isCurrent
                  ? 'bg-primary text-primary-foreground'
                  : isComplete
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {isComplete ? '✓' : i + 1}
            </div>
            <span
              className={`min-w-[3.5rem] transition-colors duration-300 ${
                isCurrent ? 'font-medium text-primary' : 'text-muted-foreground'
              }`}
            >
              {wizardStep.label}
            </span>
            {i < WIZARD_STEPS.length - 1 && (
              <span className="text-muted-foreground/40">→</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
