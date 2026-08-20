'use client';

import type { ReactNode } from 'react';
import ScoreSelector from '@/components/ScoreSelector';
import { RequiredAsterisk } from '@/components/ui/label';
import {
  interviewNoteFieldsFromGuide,
  interviewScaleMax,
  interviewScoreFieldGroups,
  interviewWeightPercents,
  type InterviewGuide,
  type InterviewScoreFieldGroup,
} from '@/lib/interview-guide';
import { cn } from '@/lib/utils';

const interviewNoteTextareaClass =
  'interview-note-textarea block min-h-[7.5rem] w-full overflow-y-auto rounded-lg border border-foreground/20 bg-background px-3 py-3 font-heading text-sm leading-[1.75] ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60';

/** White vs a slightly lighter warm stripe than #f0eae2. */
const QUESTION_STRIPE_ODD = 'bg-background';
const QUESTION_STRIPE_EVEN = 'bg-[#f4eee8]';
const QUESTION_STRIPE_HAIRLINE = 'border-b border-black/[0.06]';
const COLUMN_GRID = 'grid grid-cols-4 gap-3';

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
  compact?: boolean;
  rowIndex?: number;
  striped?: boolean;
  onNoteChange: (value: string) => void;
  onScoreChange: (value: number) => void;
}) {
  return (
    <div className={striped ? questionStripeClass(rowIndex) : 'uma-stack-block'}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm leading-relaxed text-foreground/90">{question}</p>
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
        const percents =
          scoreOnly && group.weights && group.fields.length > 0
            ? interviewWeightPercents(
                group.fields.map((field) => ({
                  name: field,
                  weight: group.weights?.[field] ?? 1,
                })),
              )
            : null;
        return (
          <section key={group.key} className="uma-stack-section">
            {group.label ? (
              <p className="uma-section-label font-normal text-muted-foreground/75">
                {group.label}
              </p>
            ) : null}
            <div className="flex flex-col">
              {group.fields.map((field, index) => (
                <InterviewQuestionEval
                  key={field}
                  question={field}
                  note={notes[field] ?? ''}
                  score={scores[field] ?? null}
                  disabled={disabled}
                  scaleMax={scaleMax}
                  showNotes={!scoreOnly}
                  weightPercent={percents?.[index]}
                  compact={compact}
                  rowIndex={index}
                  onNoteChange={(value) => onNoteChange(field, value)}
                  onScoreChange={(value) => onScoreChange(field, value)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function InterviewNotesAndScoringForm({
  guide,
  notes,
  scores,
  comment,
  disabled,
  compact = false,
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
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
}) {
  const noteQuestions = interviewNoteFieldsFromGuide(guide);
  const fieldGroups = interviewScoreFieldGroups(guide);
  const scaleMax = interviewScaleMax(guide);

  return (
    <div className="uma-stack-page">
      {noteQuestions.length > 0 ? (
        <section className="uma-stack-section">
          <p className="uma-section-label font-normal text-muted-foreground/75">
            {caseQuestionsLabel(guide)}
          </p>
          <div className="flex flex-col">
            {noteQuestions.map((question, index) => (
              <div
                key={`${index}-${question.slice(0, 32)}`}
                className={questionStripeClass(index)}
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
        </section>
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
    </div>
  );
}

function ColumnsQuestionRow({ children }: { children: ReactNode }) {
  return <div className={COLUMN_GRID}>{children}</div>;
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

/** Row-major 4-col notes: one full-width stripe per question, four candidate cells inside. */
export function InterviewNotesAndScoringColumns({
  guide,
  columns,
  compact = true,
}: {
  guide: InterviewGuide | null;
  columns: InterviewFormBindings[];
  compact?: boolean;
}) {
  const noteQuestions = interviewNoteFieldsFromGuide(guide);
  const fieldGroups = interviewScoreFieldGroups(guide);
  const scaleMax = interviewScaleMax(guide);
  const hasNoteQuestions = noteQuestions.length > 0;
  const caseLabel = caseQuestionsLabel(guide);

  return (
    <div className="space-y-3">
      {hasNoteQuestions
        ? noteQuestions.map((question, index) => (
            <ColumnsQuestionRow key={`${index}-${question.slice(0, 32)}`}>
              {columns.map((column, columnIndex) => (
                <ColumnsQuestionCell
                  key={column.id ?? columnIndex}
                  rowIndex={index}
                  sectionLabel={index === 0 ? caseLabel : undefined}
                >
                  <div className="uma-stack-block">
                    <p className="text-sm leading-relaxed text-foreground/90">{question}</p>
                    <textarea
                      value={column.notes[question] ?? ''}
                      onChange={(e) => column.onNoteChange(question, e.target.value)}
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
        const percents =
          scoreOnly && group.weights && group.fields.length > 0
            ? interviewWeightPercents(
                group.fields.map((field) => ({
                  name: field,
                  weight: group.weights?.[field] ?? 1,
                })),
              )
            : null;
        return (
          <div key={group.key} className="space-y-3">
            {group.fields.map((field, index) => (
              <ColumnsQuestionRow key={field}>
                {columns.map((column, columnIndex) => (
                  <ColumnsQuestionCell
                    key={column.id ?? columnIndex}
                    rowIndex={index}
                    sectionLabel={index === 0 ? group.label : undefined}
                  >
                    <InterviewQuestionEval
                      question={field}
                      note={column.notes[field] ?? ''}
                      score={column.scores[field] ?? null}
                      disabled={column.disabled}
                      scaleMax={scaleMax}
                      showNotes={!scoreOnly}
                      weightPercent={percents?.[index]}
                      compact={compact}
                      striped={false}
                      onNoteChange={(value) => column.onNoteChange(field, value)}
                      onScoreChange={(value) => column.onScoreChange(field, value)}
                    />
                  </ColumnsQuestionCell>
                ))}
              </ColumnsQuestionRow>
            ))}
          </div>
        );
      })}

      <ColumnsQuestionRow>
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
