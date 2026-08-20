'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  InterviewNotesAndScoringColumns,
  type InterviewFormBindings,
} from '@/components/interview-question-eval';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { InterviewGuide } from '@/lib/interview-guide';
import { rewriteLegacyInterviewIntro } from '@/lib/strategy-interview';
import { cn } from '@/lib/utils';

const LAYOUT_STORAGE_KEY = 'group-interview-layout';

export type GroupInterviewLayout = 'tabs' | 'columns';

/** 4-col name cell — white rounded chip. Tabs reuse this for active + full-name bar. */
const NAME_CHIP =
  'min-w-0 rounded-xl border border-border/35 bg-background px-4 py-2.5 sm:px-5';

/** 4-col question column (structure unchanged). */
const COLUMN_BODY =
  'min-w-0 rounded-xl border border-border/35 bg-background px-4 py-3.5 sm:px-5 sm:py-4';

/** Tabs question panel — same shell as COLUMN_BODY, gray fill for the selected candidate. */
const TABS_BODY =
  'min-w-0 rounded-xl border border-border/35 bg-muted/20 px-4 py-3.5 sm:px-5 sm:py-4';

const LAYOUT_OPTIONS: { value: GroupInterviewLayout; label: string }[] = [
  { value: 'tabs', label: 'Tabs' },
  { value: 'columns', label: '4 columns' },
];

function isGroupInterviewLayout(value: string | null): value is GroupInterviewLayout {
  return value === 'tabs' || value === 'columns';
}

function readStoredLayout(): GroupInterviewLayout | null {
  const stored = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
  if (stored === 'stacked') {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, 'columns');
    return 'columns';
  }
  if (isGroupInterviewLayout(stored)) return stored;
  return null;
}

export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part || name;
}

export function InterviewNotesPanelHeader({
  title,
  intro,
  actions,
}: {
  title: string;
  intro?: string;
  actions?: ReactNode;
}) {
  const introText = rewriteLegacyInterviewIntro(intro);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-foreground/90">{title}</h2>
        {actions}
      </div>
      {introText ? (
        <p className="text-sm leading-relaxed text-muted-foreground/90 normal-case ligatures-none">
          {introText}
        </p>
      ) : null}
    </div>
  );
}

export interface GroupInterviewCandidate {
  id: string;
  name: string;
  complete: boolean;
}

function CandidateNameHeader({
  name,
  complete,
}: {
  name: string;
  complete?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h3 className="min-w-0 break-words text-lg font-semibold">{name}</h3>
      {complete ? (
        <Check
          className="size-3.5 shrink-0 text-primary/75"
          aria-label="Scored"
        />
      ) : null}
    </div>
  );
}

function ColumnNameRow({ candidates }: { candidates: GroupInterviewCandidate[] }) {
  return (
    <div className="grid w-full grid-cols-4 gap-3">
      {candidates.map((candidate) => (
        <div
          key={candidate.id}
          className="min-w-0 rounded-xl border border-border/35 bg-background px-4 py-2.5 sm:px-5"
        >
          <CandidateNameHeader name={candidate.name} complete={candidate.complete} />
        </div>
      ))}
    </div>
  );
}

function TabsChrome({
  candidates,
  activeCandidate,
}: {
  candidates: GroupInterviewCandidate[];
  activeCandidate: GroupInterviewCandidate | undefined;
}) {
  return (
    <div className="space-y-2.5">
      <TabsList className="h-auto w-fit max-w-full flex-wrap justify-start gap-1.5 overflow-x-visible overflow-y-visible bg-transparent p-0 group-data-horizontal/tabs:h-auto">
        {candidates.map((candidate) => (
          <TabsTrigger
            key={candidate.id}
            value={candidate.id}
            className={cn(
              'h-8 cursor-pointer rounded-full border border-foreground/14 bg-transparent px-3.5 text-foreground/60 shadow-none',
              'hover:border-foreground/18 hover:bg-transparent hover:text-foreground',
              'data-active:border-foreground/22 data-active:bg-background data-active:text-foreground data-active:shadow-sm data-active:hover:bg-background',
              'dark:border-input dark:bg-input/25 dark:hover:bg-input/55',
              'dark:data-active:border-input dark:data-active:bg-background dark:data-active:text-foreground',
              'after:hidden after:content-none',
            )}
          >
            {firstName(candidate.name)}
            {candidate.complete ? (
              <Check className="size-3.5 text-primary" aria-label="Scored" />
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {activeCandidate ? (
        <CandidateNameHeader
          name={activeCandidate.name}
          complete={activeCandidate.complete}
        />
      ) : null}
    </div>
  );
}

export function useGroupInterviewLayout() {
  const [layout, setLayout] = useState<GroupInterviewLayout>('tabs');

  useEffect(() => {
    const stored = readStoredLayout();
    if (stored) setLayout(stored);
  }, []);

  const updateLayout = useCallback((next: GroupInterviewLayout) => {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, next);
  }, []);

  return { layout, updateLayout };
}

export function GroupInterviewLayoutToggle({
  value,
  onValueChange,
  className,
}: {
  value: GroupInterviewLayout;
  onValueChange: (next: GroupInterviewLayout) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <ToggleGroup
        variant="outline"
        size="sm"
        spacing={0}
        value={[value]}
        onValueChange={(next) => {
          const selected = next[0];
          if (isGroupInterviewLayout(selected)) onValueChange(selected);
        }}
        aria-label="Candidate workspace layout"
      >
        {LAYOUT_OPTIONS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="cursor-pointer normal-case"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

export function GroupInterviewCandidateWorkspace({
  candidates,
  activeId,
  onActiveIdChange,
  layout,
  guide,
  renderForm,
  getFormBindings,
  render,
}: {
  candidates: GroupInterviewCandidate[];
  activeId: string;
  onActiveIdChange: (id: string) => void;
  layout: GroupInterviewLayout;
  guide?: InterviewGuide | null;
  renderForm: (
    candidate: GroupInterviewCandidate,
    options: { compact: boolean },
  ) => ReactNode;
  getFormBindings?: (candidate: GroupInterviewCandidate) => InterviewFormBindings;
  render?: (parts: { chrome: ReactNode; body: ReactNode }) => ReactNode;
}) {
  const compact = layout !== 'tabs';
  const activeCandidate =
    candidates.find((candidate) => candidate.id === activeId) ?? candidates[0];

  const chrome =
    layout === 'columns' ? (
      <ColumnNameRow candidates={candidates} />
    ) : (
      <TabsChrome candidates={candidates} activeCandidate={activeCandidate} />
    );

  const body =
    layout === 'columns' ? (
      getFormBindings ? (
        <InterviewNotesAndScoringColumns
          guide={guide ?? null}
          compact
          columns={candidates.map((candidate) => ({
            id: candidate.id,
            ...getFormBindings(candidate),
          }))}
        />
      ) : (
        <div className="grid w-full grid-cols-4 gap-3">
          {candidates.map((candidate) => (
            <section
              key={candidate.id}
              className="min-w-0 rounded-xl border border-border/35 bg-background px-4 py-3.5 sm:px-5 sm:py-4"
            >
              <div className="min-w-0 w-full">{renderForm(candidate, { compact })}</div>
            </section>
          ))}
        </div>
      )
    ) : (
      <>
        {candidates.map((candidate) => (
          <TabsContent
            key={candidate.id}
            value={candidate.id}
            className="mt-0 data-[state=inactive]:hidden"
          >
            {renderForm(candidate, { compact: false })}
          </TabsContent>
        ))}
      </>
    );

  const framed = render ? (
    render({ chrome, body })
  ) : (
    <div className="flex flex-col gap-4">
      <div
        className="sticky z-10 bg-surface-panel pb-3"
        style={{ top: 'var(--interview-sticky-lead-height, 0px)' }}
      >
        {chrome}
      </div>
      {body}
    </div>
  );

  if (layout === 'tabs') {
    return (
      <Tabs
        value={activeId}
        onValueChange={onActiveIdChange}
        className="flex h-0 min-h-0 flex-1 flex-col gap-0"
      >
        {framed}
      </Tabs>
    );
  }

  return framed;
}

export function GroupInterviewReadOnlyNames({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {names.map((name) => (
        <span
          key={name}
          className={cn(
            'inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-1.5 text-sm font-medium',
          )}
        >
          {firstName(name)}
        </span>
      ))}
    </div>
  );
}
