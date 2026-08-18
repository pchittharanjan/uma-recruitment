'use client';

import Link from 'next/link';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
} from 'lucide-react';
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

function checklistRevealClass(delay: 'first' | 'second') {
  return cn(
    'translate-y-0 opacity-100 transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:delay-0 motion-reduce:transition-none',
    'group-data-[starting-style]/reveal:-translate-y-0.5 group-data-[starting-style]/reveal:opacity-0 group-data-[starting-style]/reveal:delay-0',
    delay === 'first' ? 'delay-[25ms]' : 'delay-[70ms]',
  );
}

function CircularProgress({ completed, total }: { completed: number; total: number }) {
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const strokeDashoffset = 100 - progress;

  return (
    <svg className="-rotate-90" height="14" viewBox="0 0 14 14" width="14" aria-hidden>
      <circle
        className="stroke-border"
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
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ring-1 ring-green-600/35 bg-green-600/10"
      >
        <CheckIcon className="size-3 shrink-0 text-green-600" />
      </span>
    );
  }
  return (
    <CircleDashedIcon
      aria-hidden
      className="mt-0.5 size-5 shrink-0 text-foreground/30"
      strokeWidth={2}
    />
  );
}

export function RecruitmentPhaseChecklist({
  title,
  steps,
}: {
  title: string;
  steps: PhaseChecklistStep[];
}) {
  const panelId = useId();
  const [openStepId, setOpenStepId] = useState<string | null>(
    () => steps.find((s) => !s.completed)?.id ?? steps[0]?.id ?? null,
  );
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

  const handleStepOpenChange = (stepId: string, nextOpen: boolean) => {
    userToggledStepRef.current = true;
    pendingScrollYRef.current = window.scrollY;
    setOpenStepId(nextOpen ? stepId : null);
  };

  const handlePanelOpenChange = (open: boolean) => {
    setPanelOpen(open);
    localStorage.setItem(checklistStorageKey(title), open ? 'expanded' : 'collapsed');
  };

  if (steps.length === 0) return null;

  return (
    <Collapsible open={panelOpen} onOpenChange={handlePanelOpenChange}>
      <div className="overflow-hidden">
        <CollapsibleTrigger
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-2 text-left uma-hover-on-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-controls={panelId}
        >
          <div className="min-w-0">
            <h3 className="font-heading text-sm font-semibold text-foreground">{title}</h3>
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
            <ChevronDownIcon
              aria-hidden
              className={cn(
                'size-4 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                !panelOpen && '-rotate-90',
              )}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent
          id={panelId}
          className={cn('[overflow-anchor:none]', !hydrated && 'transition-none')}
        >
          <div className="space-y-1 pb-2 pt-2 [overflow-anchor:none]">
            {steps.map((step, index) => {
              const isOpen = openStepId === step.id;
              const hasDescription = Boolean(step.description?.trim());
              const isFirst = index === 0;
              const prevStep = steps[index - 1];
              const isPrevOpen = prevStep && openStepId === prevStep.id;
              const showDivider = !(isFirst || isOpen || isPrevOpen);

              return (
                <Collapsible
                  className={cn(
                    'group transition-[margin] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                    showDivider && 'mt-1',
                  )}
                  key={step.id}
                  open={isOpen}
                  onOpenChange={(nextOpen) => handleStepOpenChange(step.id, nextOpen)}
                >
                  <div className="relative overflow-hidden rounded-lg border border-border/70 uma-nested-surface uma-hover-on-nested">
                    <div
                      className={cn(
                        'flex items-start gap-3.5 px-3 transition-[padding] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                        isOpen ? 'pt-3 pb-3.5' : 'py-3',
                      )}
                    >
                      <StepIndicator completed={step.completed} />
                      <div className="min-w-0 flex-1">
                        <CollapsibleTrigger
                          className="flex w-full cursor-pointer items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={(event) => {
                            event.currentTarget.focus({ preventScroll: true });
                          }}
                        >
                          <div className="min-w-0 grow">
                            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                              <h4
                                className={cn(
                                  'text-sm font-semibold leading-snug',
                                  step.completed ? 'text-primary' : 'text-foreground',
                                )}
                              >
                                {step.title}
                              </h4>
                              {step.detail && (
                                <span className="text-sm leading-snug text-muted-foreground">
                                  {step.detail}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronDownIcon
                            aria-hidden
                            className={cn(
                              'size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="group/reveal">
                          <div className="space-y-3 pt-2">
                            {hasDescription && (
                              <p
                                className={cn(
                                  'text-sm leading-relaxed text-muted-foreground',
                                  checklistRevealClass('first'),
                                )}
                              >
                                {step.description}
                              </p>
                            )}
                            <div className={checklistRevealClass(hasDescription ? 'second' : 'first')}>
                              <Button
                                size="sm"
                                nativeButton={false}
                                render={<Link href={step.href} />}
                              >
                                {step.actionLabel}
                              </Button>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </div>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
