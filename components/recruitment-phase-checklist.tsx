'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  IconChevronDown,
  IconChevronRight,
  IconCircleCheckFilled,
  IconCircleDashed,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { PhaseChecklistStep } from '@/lib/phase-checklist';

function checklistStorageKey(title: string): string {
  return `phase-checklist-collapsed:${title}`;
}

function CircularProgress({ completed, total }: { completed: number; total: number }) {
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const strokeDashoffset = 100 - progress;

  return (
    <svg className="-rotate-90" height="14" viewBox="0 0 14 14" width="14" aria-hidden>
      <circle
        className="stroke-muted"
        cx="7"
        cy="7"
        fill="none"
        pathLength="100"
        r="6"
        strokeWidth="2"
      />
      <circle
        className="stroke-primary"
        cx="7"
        cy="7"
        fill="none"
        pathLength="100"
        r="6"
        strokeDasharray="100"
        strokeLinecap="round"
        strokeWidth="2"
        style={{ strokeDashoffset }}
      />
    </svg>
  );
}

function StepIndicator({ completed }: { completed: boolean }) {
  if (completed) {
    return (
      <IconCircleCheckFilled
        aria-hidden
        className="mt-0.5 size-4.5 shrink-0 text-primary"
      />
    );
  }
  return (
    <IconCircleDashed
      aria-hidden
      className="mt-0.5 size-5 shrink-0 stroke-muted-foreground/40"
      strokeWidth={2}
    />
  );
}

export function RecruitmentPhaseChecklist({
  title,
  steps,
  preview = false,
}: {
  title: string;
  steps: PhaseChecklistStep[];
  preview?: boolean;
}) {
  const panelId = useId();
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const userToggledStepRef = useRef(false);
  const pendingScrollYRef = useRef<number | null>(null);
  const stepsKey = steps.map((step) => step.id).join('|');

  const completedCount = steps.filter((s) => s.completed).length;
  const allDone = steps.length > 0 && completedCount === steps.length;

  useEffect(() => {
    const stored = localStorage.getItem(checklistStorageKey(title));
    if (stored === 'collapsed') {
      setPanelOpen(false);
    } else if (stored === 'expanded') {
      setPanelOpen(true);
    } else {
      setPanelOpen(!allDone);
    }
    setHydrated(true);
  }, [title, allDone]);

  useEffect(() => {
    userToggledStepRef.current = false;
  }, [title, stepsKey]);

  useEffect(() => {
    if (!hydrated || !panelOpen || userToggledStepRef.current) return;
    const firstIncomplete = steps.find((s) => !s.completed);
    setOpenStepId(firstIncomplete?.id ?? steps[0]?.id ?? null);
  }, [steps, stepsKey, panelOpen, hydrated]);

  useLayoutEffect(() => {
    if (pendingScrollYRef.current === null) return;
    const scrollY = pendingScrollYRef.current;
    pendingScrollYRef.current = null;
    window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
  }, [openStepId]);

  const handleStepToggle = (stepId: string, isOpen: boolean) => {
    userToggledStepRef.current = true;
    pendingScrollYRef.current = window.scrollY;
    setOpenStepId(isOpen ? null : stepId);
  };

  const handlePanelOpenChange = (open: boolean) => {
    setPanelOpen(open);
    localStorage.setItem(checklistStorageKey(title), open ? 'expanded' : 'collapsed');
  };

  if (steps.length === 0) return null;

  return (
    <Collapsible open={panelOpen} onOpenChange={handlePanelOpenChange}>
      <div className="rounded-lg border border-border/60 bg-background">
        <CollapsibleTrigger
          className="flex w-full cursor-pointer items-start justify-between gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-controls={panelId}
        >
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {preview
                ? 'Preview — tasks for this phase before you advance.'
                : panelOpen
                  ? 'Complete these before advancing to the next phase.'
                  : allDone
                    ? 'All tasks complete — expand to review.'
                    : `${completedCount} of ${steps.length} tasks complete.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CircularProgress completed={completedCount} total={steps.length} />
              <span>
                <span className="font-medium text-foreground">{completedCount}</span>
                {' / '}
                <span className="font-medium text-foreground">{steps.length}</span> done
              </span>
            </div>
            {panelOpen ? (
              <IconChevronDown aria-hidden className="size-4 text-muted-foreground" />
            ) : (
              <IconChevronRight aria-hidden className="size-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent
          id={panelId}
          className="border-t border-border/60 px-4 pb-4 pt-2 [overflow-anchor:none]"
        >
          <div className="space-y-0 [overflow-anchor:none]">
            {steps.map((step, index) => {
              const isOpen = openStepId === step.id;
              const hasDescription = step.description.trim().length > 0;
              const isFirst = index === 0;
              const prevStep = steps[index - 1];
              const isPrevOpen = prevStep && openStepId === prevStep.id;
              const showBorderTop = !(isFirst || isOpen || isPrevOpen);

              return (
                <div
                  className={cn('group', isOpen && 'rounded-lg', showBorderTop && 'border-t border-border')}
                  key={step.id}
                >
                  <div
                    className={cn(
                      'relative overflow-hidden rounded-lg transition-colors',
                      isOpen && 'border border-border bg-muted/40',
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-3 pr-2 pl-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isOpen
                          ? hasDescription
                            ? 'py-2.5'
                            : 'pt-2.5 pb-1'
                          : 'py-2.5',
                      )}
                      onClick={(event) => {
                        event.currentTarget.focus({ preventScroll: true });
                        handleStepToggle(step.id, isOpen);
                      }}
                    >
                      <div className="flex min-w-0 flex-1 gap-3">
                        <StepIndicator completed={step.completed} />
                        <div className="min-w-0 grow">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <h4
                              className={cn(
                                'text-sm font-semibold',
                                step.completed ? 'text-primary' : 'text-foreground',
                              )}
                            >
                              {step.title}
                            </h4>
                            {step.detail && (
                              <span className="text-sm text-muted-foreground">{step.detail}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <IconChevronDown
                        aria-hidden
                        className={cn(
                          'size-4 shrink-0 text-muted-foreground transition-transform duration-200',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 pl-11">
                        {hasDescription && (
                          <p className="max-w-prose text-pretty text-sm text-muted-foreground">
                            {step.description}
                          </p>
                        )}
                        <Button
                          className={cn(hasDescription ? 'mt-2' : 'mt-1')}
                          size="sm"
                          nativeButton={false}
                          render={<Link href={step.href} />}
                        >
                          {step.actionLabel}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
