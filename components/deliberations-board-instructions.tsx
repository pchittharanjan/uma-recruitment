'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRightIcon,
  ChevronDownIcon,
  LockIcon,
  MoreHorizontalIcon,
  SaveIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const INSTRUCTIONS_STORAGE_KEY = 'uma-deliberations-board-instructions';

const COLUMN_CHIPS = [
  { label: 'Pool', className: 'border-sky-300 bg-sky-100 text-sky-950' },
  { label: 'Considering', className: 'border-amber-300 bg-amber-100 text-amber-950' },
  { label: 'Accept', className: 'border-green-300 bg-green-100 text-green-950' },
] as const;

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-xs font-semibold text-foreground"
    >
      {n}
    </span>
  );
}

function InstructionStep({
  step,
  title,
  children,
  className,
}: {
  step: number;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-border bg-muted/40 p-2.5', className)}>
      <div className="flex gap-2.5">
        <StepNumber n={step} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium leading-snug text-foreground">{title}</p>
          <div className="text-sm leading-snug text-muted-foreground">{children}</div>
        </div>
      </div>
    </div>
  );
}

function ColumnFlow() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {COLUMN_CHIPS.map((col, i) => (
        <span key={col.label} className="flex items-center gap-1.5">
          {i > 0 ? (
            <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
          ) : null}
          <Badge variant="outline" className={cn('h-6 px-2 text-xs font-medium', col.className)}>
            {col.label}
          </Badge>
        </span>
      ))}
    </div>
  );
}

function InlineIcon({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-border/80 bg-background px-1 py-0.5 align-middle text-foreground">
      {children}
    </span>
  );
}

function SaveStepBody({
  readOnly,
  canSave,
  canFinalize,
  personalBoard,
  selectionComplete,
}: {
  readOnly: boolean;
  canSave: boolean;
  canFinalize: boolean;
  personalBoard?: boolean;
  selectionComplete: boolean;
}) {
  if (personalBoard && canSave && !readOnly) {
    return (
      <p>
        Your personal board autosaves as you move cards. The admin deliberations screen is
        the official source for final acceptances.
      </p>
    );
  }

  if (readOnly && !canSave) {
    return (
      <p>
        Discussion view only. An Admin saves the official board — follow the room on the
        admin screen.
      </p>
    );
  }

  if (readOnly) {
    return <p>Recruitment is closed. The board is view-only.</p>;
  }

  if (!canSave) {
    return (
      <p>
        Discussion view only. An Admin saves the official board — follow the room on the
        admin screen.
      </p>
    );
  }

  if (selectionComplete) {
    return (
      <p className="inline-flex items-center gap-1.5">
        <LockIcon className="size-3.5 shrink-0" aria-hidden />
        Offers are sent. The board is locked.
      </p>
    );
  }

  if (canFinalize) {
    return (
      <>
        <p>
          Click{' '}
          <InlineIcon>
            <SaveIcon className="size-3" aria-hidden />
            Save
          </InlineIcon>{' '}
          so everyone sees the latest board.
        </p>
        <p className="mt-1">
          When Accept is ready, click{' '}
          <strong className="font-medium text-foreground">Complete final selection</strong>.
        </p>
      </>
    );
  }

  return <p>Click Save to keep your changes.</p>;
}

export function DeliberationsBoardInstructions({
  canSave,
  canEditAcceptCap,
  canFinalize,
  readOnly,
  personalBoard = false,
  selectionComplete,
  phasePreview = false,
}: {
  canSave: boolean;
  /** Admin can change the Accept offer cap from the board. */
  canEditAcceptCap?: boolean;
  canFinalize: boolean;
  readOnly: boolean;
  /** Team portal personal scratch board (autosaved, not official). */
  personalBoard?: boolean;
  selectionComplete: boolean;
  /** Admin is browsing deliberations before this team has reached that phase. */
  phasePreview?: boolean;
}) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(INSTRUCTIONS_STORAGE_KEY);
      if (stored === 'collapsed') setOpen(false);
    } catch {
      // ignore
    }
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(INSTRUCTIONS_STORAGE_KEY, next ? 'expanded' : 'collapsed');
    } catch {
      // ignore
    }
  };

  const effectiveCanEditAcceptCap = canEditAcceptCap ?? canSave;
  const showSaveStep =
    !phasePreview || canFinalize || selectionComplete || readOnly || !canSave;

  let step = 1;

  const dragStep = step++;
  const acceptLimitStep = step++;
  const cardActionsStep = step++;
  const saveStep = showSaveStep ? step++ : null;

  const discussionViewOnly = !canSave && !personalBoard;
  const saveTitle = personalBoard && canSave && !readOnly
    ? 'Personal board autosaves'
    : readOnly && canSave
      ? 'View only'
      : discussionViewOnly
        ? 'Discussion view only'
        : selectionComplete
          ? 'Offers sent'
          : canFinalize
            ? 'Save and finish'
            : 'Save your work';

  const dragStepTitle =
    personalBoard && canSave && !readOnly
      ? 'Drag candidates on your personal board:'
      : readOnly && canSave
        ? 'Board is locked — recruitment is closed:'
        : discussionViewOnly
          ? 'Follow the board as your team deliberates:'
          : 'Drag each candidate as your team talks through them:';

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span className="text-sm font-semibold text-foreground">How this board works</span>
          <ChevronDownIcon
            aria-hidden
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-3">
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            <InstructionStep step={dragStep} title={dragStepTitle}>
              {discussionViewOnly ? (
                <p>
                  Columns show where candidates stand. Watch the admin screen for live
                  moves during the room discussion.
                </p>
              ) : personalBoard ? (
                <>
                  <ColumnFlow />
                  <p className="mt-1.5">
                    Experiment freely — only the admin board counts for final offers.
                  </p>
                </>
              ) : (
                <ColumnFlow />
              )}
            </InstructionStep>

            <InstructionStep step={acceptLimitStep} title="Acceptances have a limit">
              {effectiveCanEditAcceptCap ? (
                <p>Change the limit with the icon on the Accept column.</p>
              ) : (
                <p>Accept only fits a set number of people. Ask an admin to change the cap.</p>
              )}
            </InstructionStep>

            <InstructionStep
              step={cardActionsStep}
              title="Click a card to see their application, notes, & scores."
            >
              <p>
                Click the{' '}
                <InlineIcon>
                  <MoreHorizontalIcon className="size-3" aria-hidden />
                </InlineIcon>{' '}
                menu to reject or open candidate comparisons.
              </p>
              <p className="mt-1">
                Reject marks a deliberations flag until Admin finalizes — it is not the
                same as rejection in earlier rounds.
              </p>
            </InstructionStep>

            {saveStep !== null ? (
              <InstructionStep step={saveStep} title={saveTitle}>
                <SaveStepBody
                  readOnly={readOnly}
                  canSave={canSave}
                  canFinalize={canFinalize}
                  personalBoard={personalBoard}
                  selectionComplete={selectionComplete}
                />
              </InstructionStep>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
