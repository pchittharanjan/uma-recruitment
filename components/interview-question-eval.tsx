'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import ScoreSelector from '@/components/ScoreSelector';
import { Button } from '@/components/ui/button';
import { RequiredAsterisk } from '@/components/ui/label';
import {
  interviewNoteFieldsFromGuide,
  interviewNoteSectionsFromGuide,
  interviewBehavioralNoteFieldsFromGuide,
  interviewQuestionBankFromGuide,
  interviewScaleMax,
  interviewScoreFieldGroups,
  interviewWeightPercents,
  type InterviewGuide,
  type InterviewScoreFieldGroup,
} from '@/lib/interview-guide';
import { cn } from '@/lib/utils';
import { Plus, X } from 'lucide-react';

const interviewNoteTextareaClass =
  'interview-note-textarea block min-h-[7.5rem] w-full overflow-y-auto rounded-lg border border-foreground/20 bg-background px-3 py-3 font-heading text-sm leading-[1.75] ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';

/** White vs a slightly lighter warm stripe than #f0eae2. */
const QUESTION_STRIPE_ODD = 'bg-background';
const QUESTION_STRIPE_EVEN = 'bg-[#f4eee8]';
const QUESTION_STRIPE_HAIRLINE = 'border-b border-black/[0.06]';

function columnsGridClass(count: number): string {
  return cn(
    'grid gap-3',
    count <= 1 && 'grid-cols-1',
    count === 2 && 'grid-cols-2',
    count === 3 && 'grid-cols-3',
    count === 4 && 'grid-cols-4',
    count === 5 && 'grid-cols-5',
    count === 6 && 'grid-cols-6',
    count >= 7 && 'grid-cols-6 min-w-[72rem]',
  );
}

function questionStripeClass(index: number) {
  return cn(
    'uma-stack-block px-5 py-4 sm:px-6 sm:py-5',
    QUESTION_STRIPE_HAIRLINE,
    index % 2 === 1 ? QUESTION_STRIPE_EVEN : QUESTION_STRIPE_ODD,
  );
}

function columnsCellClass(index: number) {
  return cn(
    'min-w-0 rounded-xl px-5 py-4 sm:px-6 sm:py-5',
    index % 2 === 1 ? QUESTION_STRIPE_EVEN : QUESTION_STRIPE_ODD,
  );
}

function caseQuestionsLabel(guide: InterviewGuide | null): string {
  return guide?.format === 'case_and_behavioral' ? 'Part 1: Case questions' : 'Case questions';
}

export type InterviewFormBindings = {
  id?: string;
  notes: Record<string, string>;
  scores: Record<string, number>;
  comment: string;
  disabled?: boolean;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
};

export function InterviewQuestionEval({
  question,
  note,
  score,
  disabled,
  scaleMax = 5,
  showNotes = true,
  weightPercent,
  description,
  compact = false,
  rowIndex = 0,
  striped = true,
  onNoteChange,
  onScoreChange,
}: {
  question: string;
  note: string;
  score: number | null;
  disabled?: boolean;
  scaleMax?: number;
  showNotes?: boolean;
  weightPercent?: number;
  description?: string;
  compact?: boolean;
  rowIndex?: number;
  striped?: boolean;
  onNoteChange: (value: string) => void;
  onScoreChange: (value: number) => void;
}) {
  return (
    <div className={striped ? questionStripeClass(rowIndex) : 'uma-stack-block'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm leading-relaxed text-foreground/90">{question}</p>
          {description?.trim() ? (
            <p className="text-xs leading-relaxed text-muted-foreground">{description.trim()}</p>
          ) : null}
        </div>
        {weightPercent != null ? (
          <p className="shrink-0 text-xs text-muted-foreground/85">{weightPercent}%</p>
        ) : null}
      </div>
      {showNotes ? (
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled}
          rows={compact ? 3 : 4}
          placeholder="Write notes for this question…"
          className={cn(interviewNoteTextareaClass, 'resize-y')}
        />
      ) : null}
      <div className="uma-stack-control">
        <p className="text-xs text-muted-foreground/85">
          Rate on a scale of 1–{scaleMax}
          <RequiredAsterisk className="ml-0.5" />
        </p>
        <ScoreSelector
          value={score}
          onChange={onScoreChange}
          disabled={disabled}
          max={scaleMax}
        />
      </div>
    </div>
  );
}

export function InterviewQuestionGroups({
  groups,
  notes,
  scores,
  disabled,
  scaleMax = 5,
  compact = false,
  onNoteChange,
  onScoreChange,
}: {
  groups: InterviewScoreFieldGroup[];
  notes: Record<string, string>;
  scores: Record<string, number>;
  disabled?: boolean;
  scaleMax?: number;
  compact?: boolean;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
}) {
  return (
    <div className="uma-stack-page">
      {groups.map((group) => {
        const scoreOnly = group.key === 'case';
        const blocks =
          group.categories && group.categories.length > 0
            ? group.categories
            : [
                {
                  name: '',
                  weightPercent: 100,
                  fields: group.fields,
                  fieldWeightPercents:
                    scoreOnly && group.weights && group.fields.length > 0
                      ? interviewWeightPercents(
                          group.fields.map((field) => ({
                            name: field,
                            weight: group.weights?.[field] ?? 1,
                          })),
                        )
                      : group.fields.map(() => undefined as number | undefined),
                  descriptions: undefined as Array<string | undefined> | undefined,
                },
              ];

        let rowIndex = 0;
        return (
          <section key={group.key} className="uma-stack-section">
            {group.label ? (
              <p className="uma-section-label font-normal text-muted-foreground/75">
                {group.label}
              </p>
            ) : null}
            <div className="flex flex-col">
              {blocks.map((block) => (
                <div key={`${group.key}-${block.name || 'flat'}`} className="flex flex-col">
                  {block.name ? (
                    <div className={questionStripeClass(rowIndex++)}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">{block.name}</p>
                        <p className="shrink-0 text-xs text-muted-foreground/85">
                          {block.weightPercent}%
                        </p>
                      </div>
                    </div>
                  ) : null}
                  {block.fields.map((field, index) => {
                    const currentRow = rowIndex++;
                    return (
                      <InterviewQuestionEval
                        key={field}
                        question={field}
                        description={block.descriptions?.[index]}
                        note={notes[field] ?? ''}
                        score={scores[field] ?? null}
                        disabled={disabled}
                        scaleMax={scaleMax}
                        showNotes={!scoreOnly}
                        weightPercent={block.fieldWeightPercents[index]}
                        compact={compact}
                        rowIndex={currentRow}
                        onNoteChange={(value) => onNoteChange(field, value)}
                        onScoreChange={(value) => onScoreChange(field, value)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function reservedNoteKeys(guide: InterviewGuide | null): Set<string> {
  const keys = new Set<string>();
  for (const q of interviewNoteFieldsFromGuide(guide)) keys.add(q);
  for (const q of interviewBehavioralNoteFieldsFromGuide(guide)) keys.add(q);
  for (const field of interviewScoreFieldGroups(guide).flatMap((g) => g.fields)) {
    keys.add(field);
  }
  return keys;
}

type AdditionalBehavioralSlot = { id: string; question: string };

function slotsFromNotes(
  notes: Record<string, string>,
  guide: InterviewGuide | null,
  idPrefix: string,
  suppressed: ReadonlySet<string> = new Set(),
): AdditionalBehavioralSlot[] {
  const reserved = reservedNoteKeys(guide);
  const slots: AdditionalBehavioralSlot[] = [];
  let i = 0;
  for (const [key, value] of Object.entries(notes)) {
    const question = key.trim();
    // Only hydrate extras that still have note text. Bank membership alone must not
    // recreate a slot after remove (clear leaves an empty string key in `notes`).
    if (!question || reserved.has(question) || suppressed.has(question) || !value?.trim()) {
      continue;
    }
    slots.push({ id: `${idPrefix}-${i++}`, question });
  }
  return slots;
}

function AdditionalBehavioralNotes({
  guide,
  notes,
  disabled,
  compact = false,
  onNoteChange,
}: {
  guide: InterviewGuide | null;
  notes: Record<string, string>;
  disabled?: boolean;
  compact?: boolean;
  onNoteChange: (field: string, value: string) => void;
}) {
  const idPrefix = useId();
  const bank = interviewQuestionBankFromGuide(guide);
  const suppressedRef = useRef<Set<string>>(new Set());
  const [slots, setSlots] = useState<AdditionalBehavioralSlot[]>(() =>
    slotsFromNotes(notes, guide, idPrefix, suppressedRef.current),
  );

  useEffect(() => {
    setSlots((prev) => {
      const fromNotes = slotsFromNotes(notes, guide, idPrefix, suppressedRef.current);
      if (fromNotes.length === 0) return prev;
      const existingQuestions = new Set(prev.map((s) => s.question.trim()).filter(Boolean));
      const missing = fromNotes.filter((s) => !existingQuestions.has(s.question));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, [notes, guide, idPrefix]);

  if (bank.length === 0 && slots.length === 0) return null;

  const usedQuestions = new Set(slots.map((s) => s.question.trim()).filter(Boolean));
  const unusedBank = bank.filter((q) => !usedQuestions.has(q));

  const addSlot = (question = '') => {
    const trimmed = question.trim();
    if (trimmed) suppressedRef.current.delete(trimmed);
    setSlots((prev) => [...prev, { id: `${idPrefix}-${prev.length}-${Date.now()}`, question }]);
  };

  const updateSlotQuestion = (id: string, nextQuestion: string) => {
    setSlots((prev) => {
      const current = prev.find((s) => s.id === id);
      if (!current) return prev;
      const prevQ = current.question.trim();
      const nextQ = nextQuestion.trim();
      if (prevQ && prevQ !== nextQ) {
        suppressedRef.current.delete(prevQ);
        if (nextQ) suppressedRef.current.delete(nextQ);
        const existing = notes[prevQ] ?? '';
        if (existing) {
          onNoteChange(nextQ || prevQ, existing);
          if (nextQ) onNoteChange(prevQ, '');
        }
      }
      return prev.map((s) => (s.id === id ? { ...s, question: nextQuestion } : s));
    });
  };

  const removeSlot = (id: string) => {
    const current = slots.find((s) => s.id === id);
    const question = current?.question.trim() ?? '';
    if (question) suppressedRef.current.add(question);
    setSlots((prev) => prev.filter((s) => s.id !== id));
    if (question) onNoteChange(question, '');
  };

  return (
    <section className="uma-stack-section">
      <p className="uma-section-label font-normal text-muted-foreground/75">
        Additional behavioral (optional)
      </p>
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        Pick from the bank or type your own. Notes only — score the fixed criteria below.
      </p>

      {bank.length > 0 ? (
        <div className="mb-4 rounded-lg border border-foreground/10 bg-muted/25 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Question bank</p>
          <ul className="space-y-2">
            {bank.map((question) => {
              const used = usedQuestions.has(question);
              return (
                <li key={question} className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/85">
                    {question}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 normal-case"
                    disabled={disabled || used}
                    onClick={() => addSlot(question)}
                  >
                    {used ? 'Added' : 'Use'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col">
        {slots.map((slot, index) => {
          const noteKey = slot.question.trim();
          return (
            <div key={slot.id} className={questionStripeClass(index)}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">Extra question {index + 1}</p>
                {!disabled ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => removeSlot(slot.id)}
                    aria-label={`Remove extra question ${index + 1}`}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
              <textarea
                value={slot.question}
                onChange={(e) => updateSlotQuestion(slot.id, e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="Paste or type the question you asked…"
                className={cn(interviewNoteTextareaClass, 'mb-2 min-h-[3.5rem] resize-y')}
              />
              <textarea
                value={noteKey ? (notes[noteKey] ?? '') : ''}
                onChange={(e) => {
                  if (!noteKey) return;
                  onNoteChange(noteKey, e.target.value);
                }}
                disabled={disabled || !noteKey}
                rows={compact ? 3 : 4}
                placeholder={
                  noteKey
                    ? 'Write notes for this question…'
                    : 'Add the question above first, then take notes…'
                }
                className={cn(interviewNoteTextareaClass, 'resize-y')}
              />
            </div>
          );
        })}
      </div>

      {!disabled ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="normal-case"
            onClick={() => addSlot('')}
          >
            <Plus className="mr-1 size-4" />
            Add additional behavioral
          </Button>
          {unusedBank.length > 0 && slots.length === 0 ? (
            <span className="self-center text-xs text-muted-foreground">
              or tap Use on a bank question
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function InterviewNotesAndScoringForm({
  guide,
  notes,
  scores,
  comment,
  disabled,
  compact = false,
  phase,
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide | null;
  notes: Record<string, string>;
  scores: Record<string, number>;
  comment: string;
  disabled?: boolean;
  compact?: boolean;
  /** When set, only show fields for this interview phase (case → behavioral). */
  phase?: 'case' | 'behavioral';
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
}) {
  const behavioralNoteQuestions =
    phase === 'case' ? [] : interviewBehavioralNoteFieldsFromGuide(guide);
  const caseNoteSections =
    phase === 'behavioral' ? [] : interviewNoteSectionsFromGuide(guide);
  const displayNoteSections =
    phase === 'behavioral'
      ? behavioralNoteQuestions.length > 0
        ? [{ title: '', points: behavioralNoteQuestions }]
        : []
      : phase === 'case'
        ? caseNoteSections
        : behavioralNoteQuestions.length > 0
          ? [
              ...caseNoteSections,
              { title: 'Behavioral questions', points: behavioralNoteQuestions },
            ]
          : caseNoteSections;
  const allGroups = interviewScoreFieldGroups(guide);
  const fieldGroups =
    phase != null
      ? allGroups.filter((g) => g.key === phase)
      : allGroups;
  const scaleMax = interviewScaleMax(guide);
  const noteSectionLabel =
    phase === 'behavioral'
      ? 'Part 2: Behavioral questions'
      : phase === 'case'
        ? caseQuestionsLabel(guide)
        : null;
  const showAdditionalBehavioral = phase == null || phase === 'behavioral';

  return (
    <div className="uma-stack-page">
      {displayNoteSections.length > 0 ? (
        <section className="uma-stack-section">
          {noteSectionLabel ? (
            <p className="uma-section-label font-normal text-muted-foreground/75">
              {noteSectionLabel}
            </p>
          ) : null}
          <div className="space-y-5">
            {displayNoteSections.map((section, sectionIndex) => {
              const showSectionTitle = Boolean(section.title);
              let rowIndex = 0;
              // Offset stripe index across prior sections for continuity.
              for (let i = 0; i < sectionIndex; i++) {
                rowIndex += displayNoteSections[i].points.length;
              }
              return (
                <div
                  key={`${sectionIndex}-${section.title || 'notes'}`}
                  className={
                    showSectionTitle
                      ? 'rounded-xl border border-foreground/10 bg-background/40'
                      : undefined
                  }
                >
                  {showSectionTitle ? (
                    <div className="border-b border-foreground/10 px-5 py-3 sm:px-6">
                      <p className="text-sm font-semibold tracking-wide text-foreground">
                        {section.title}
                      </p>
                    </div>
                  ) : null}
                  <div className="flex flex-col">
                    {section.points.map((question, index) => (
                      <div
                        key={`${sectionIndex}-${index}-${question.slice(0, 32)}`}
                        className={questionStripeClass(rowIndex + index)}
                      >
                        <p className="text-sm leading-relaxed text-foreground/90">{question}</p>
                        <textarea
                          value={notes[question] ?? ''}
                          onChange={(e) => onNoteChange(question, e.target.value)}
                          disabled={disabled}
                          rows={compact ? 3 : 4}
                          placeholder="Write notes for this question…"
                          className={cn(interviewNoteTextareaClass, 'resize-y')}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {showAdditionalBehavioral ? (
        <AdditionalBehavioralNotes
          guide={guide}
          notes={notes}
          disabled={disabled}
          compact={compact}
          onNoteChange={onNoteChange}
        />
      ) : null}

      <InterviewQuestionGroups
        groups={fieldGroups}
        notes={notes}
        scores={scores}
        disabled={disabled}
        scaleMax={scaleMax}
        compact={compact}
        onNoteChange={onNoteChange}
        onScoreChange={onScoreChange}
      />

      {(phase == null || phase === 'behavioral') && (
        <section className="uma-stack-section">
          <p className="uma-section-label font-normal text-muted-foreground/75">
            Overall notes
          </p>
          <textarea
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            disabled={disabled}
            placeholder="Anything else from the interview (not visible to other stages until deliberations)"
            rows={3}
            className={cn(interviewNoteTextareaClass, 'resize-none')}
          />
        </section>
      )}
    </div>
  );
}

function ColumnsQuestionRow({
  children,
  columnCount,
}: {
  children: ReactNode;
  columnCount: number;
}) {
  return <div className={columnsGridClass(columnCount)}>{children}</div>;
}

function ColumnsQuestionCell({
  children,
  rowIndex,
  sectionLabel,
}: {
  children: ReactNode;
  rowIndex: number;
  sectionLabel?: string | null;
}) {
  return (
    <div className={columnsCellClass(rowIndex)}>
      {sectionLabel ? (
        <div className="uma-stack-block">
          <p className="uma-section-label font-normal text-muted-foreground/75">
            {sectionLabel}
          </p>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Row-major notes: one stripe per question, one cell per candidate. */
export function InterviewNotesAndScoringColumns({
  guide,
  columns,
  compact = true,
}: {
  guide: InterviewGuide | null;
  columns: InterviewFormBindings[];
  compact?: boolean;
}) {
  const noteSections = interviewNoteSectionsFromGuide(guide);
  const fieldGroups = interviewScoreFieldGroups(guide);
  const scaleMax = interviewScaleMax(guide);
  const hasNoteQuestions = noteSections.some((section) => section.points.length > 0);
  const caseLabel = caseQuestionsLabel(guide);
  const columnCount = Math.max(columns.length, 1);

  const noteRows: Array<{
    question: string;
    rowIndex: number;
    sectionLabel?: string;
    blockTitle?: string;
  }> = [];
  let rowIndex = 0;
  for (let sectionIndex = 0; sectionIndex < noteSections.length; sectionIndex++) {
    const section = noteSections[sectionIndex];
    for (let i = 0; i < section.points.length; i++) {
      const isFirstOverall = noteRows.length === 0;
      const isFirstInSection = i === 0;
      let sectionLabel: string | undefined;
      let blockTitle: string | undefined;
      if (isFirstOverall) {
        sectionLabel = caseLabel;
        if (section.title) blockTitle = section.title;
      } else if (isFirstInSection && section.title) {
        sectionLabel = section.title;
      }
      noteRows.push({
        question: section.points[i],
        rowIndex: rowIndex++,
        sectionLabel,
        blockTitle,
      });
    }
  }

  return (
    <div className="space-y-3 overflow-x-auto">
      {hasNoteQuestions
        ? noteRows.map((row) => (
            <ColumnsQuestionRow
              key={`${row.rowIndex}-${row.question.slice(0, 32)}`}
              columnCount={columnCount}
            >
              {columns.map((column, columnIndex) => (
                <ColumnsQuestionCell
                  key={column.id ?? columnIndex}
                  rowIndex={row.rowIndex}
                  sectionLabel={row.sectionLabel}
                >
                  <div className="uma-stack-block">
                    {row.blockTitle ? (
                      <p className="text-sm font-semibold tracking-wide text-foreground">
                        {row.blockTitle}
                      </p>
                    ) : null}
                    <p className="text-sm leading-relaxed text-foreground/90">{row.question}</p>
                    <textarea
                      value={column.notes[row.question] ?? ''}
                      onChange={(e) => column.onNoteChange(row.question, e.target.value)}
                      disabled={column.disabled}
                      rows={compact ? 3 : 4}
                      placeholder="Write notes for this question…"
                      className={cn(interviewNoteTextareaClass, 'resize-y')}
                    />
                  </div>
                </ColumnsQuestionCell>
              ))}
            </ColumnsQuestionRow>
          ))
        : null}

      {fieldGroups.map((group) => {
        const scoreOnly = group.key === 'case';
        const blocks =
          group.categories && group.categories.length > 0
            ? group.categories
            : [
                {
                  name: group.label,
                  weightPercent: 100,
                  fields: group.fields,
                  fieldWeightPercents:
                    scoreOnly && group.weights && group.fields.length > 0
                      ? interviewWeightPercents(
                          group.fields.map((field) => ({
                            name: field,
                            weight: group.weights?.[field] ?? 1,
                          })),
                        )
                      : group.fields.map(() => undefined as number | undefined),
                  descriptions: undefined as Array<string | undefined> | undefined,
                },
              ];

        return (
          <div key={group.key} className="space-y-3">
            {blocks.map((block) =>
              block.fields.map((field, index) => (
                <ColumnsQuestionRow
                  key={`${block.name}-${field}`}
                  columnCount={columnCount}
                >
                  {columns.map((column, columnIndex) => (
                    <ColumnsQuestionCell
                      key={column.id ?? columnIndex}
                      rowIndex={index}
                      sectionLabel={
                        index === 0
                          ? block.name
                            ? `${block.name} · ${block.weightPercent}%`
                            : group.label
                          : undefined
                      }
                    >
                      <InterviewQuestionEval
                        question={field}
                        description={block.descriptions?.[index]}
                        note={column.notes[field] ?? ''}
                        score={column.scores[field] ?? null}
                        disabled={column.disabled}
                        scaleMax={scaleMax}
                        showNotes={!scoreOnly}
                        weightPercent={block.fieldWeightPercents[index]}
                        compact={compact}
                        striped={false}
                        onNoteChange={(value) => column.onNoteChange(field, value)}
                        onScoreChange={(value) => column.onScoreChange(field, value)}
                      />
                    </ColumnsQuestionCell>
                  ))}
                </ColumnsQuestionRow>
              )),
            )}
          </div>
        );
      })}

      <ColumnsQuestionRow columnCount={columnCount}>
        {columns.map((column, columnIndex) => (
          <ColumnsQuestionCell
            key={column.id ?? columnIndex}
            rowIndex={0}
            sectionLabel="Overall notes"
          >
            <textarea
              value={column.comment}
              onChange={(e) => column.onCommentChange(e.target.value)}
              disabled={column.disabled}
              placeholder="Anything else from the interview (not visible to other stages until deliberations)"
              rows={3}
              className={cn(interviewNoteTextareaClass, 'resize-none')}
            />
          </ColumnsQuestionCell>
        ))}
      </ColumnsQuestionRow>
    </div>
  );
}
