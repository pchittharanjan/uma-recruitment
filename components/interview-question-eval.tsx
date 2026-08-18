'use client';

import ScoreSelector from '@/components/ScoreSelector';
import { Card } from '@/components/ui/card';
import { RequiredAsterisk } from '@/components/ui/label';
import {
  interviewNoteFieldsFromGuide,
  interviewScaleMax,
  interviewScoreFieldGroups,
  interviewWeightPercents,
  type InterviewGuide,
  type InterviewScoreFieldGroup,
} from '@/lib/interview-guide';

export function InterviewQuestionEval({
  question,
  note,
  score,
  disabled,
  scaleMax = 5,
  showNotes = true,
  weightPercent,
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
  onNoteChange: (value: string) => void;
  onScoreChange: (value: number) => void;
}) {
  return (
    <Card className="gap-6 p-6">
      <div className="space-y-1">
        <p className="text-sm leading-relaxed text-foreground">{question}</p>
        {weightPercent != null ? (
          <p className="text-xs text-muted-foreground">{weightPercent}% of evaluation</p>
        ) : null}
      </div>
      {showNotes ? (
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="Write notes for this question…"
          className="field-textarea resize-y disabled:opacity-60"
        />
      ) : null}
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
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
    </Card>
  );
}

export function InterviewQuestionGroups({
  groups,
  notes,
  scores,
  disabled,
  scaleMax = 5,
  onNoteChange,
  onScoreChange,
}: {
  groups: InterviewScoreFieldGroup[];
  notes: Record<string, string>;
  scores: Record<string, number>;
  disabled?: boolean;
  scaleMax?: number;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
}) {
  return (
    <div className="space-y-8">
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
          <section key={group.key} className="space-y-5">
            {group.label ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
            ) : null}
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
                onNoteChange={(value) => onNoteChange(field, value)}
                onScoreChange={(value) => onScoreChange(field, value)}
              />
            ))}
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
  onNoteChange,
  onScoreChange,
  onCommentChange,
}: {
  guide: InterviewGuide | null;
  notes: Record<string, string>;
  scores: Record<string, number>;
  comment: string;
  disabled?: boolean;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
  onCommentChange: (value: string) => void;
}) {
  const noteQuestions = interviewNoteFieldsFromGuide(guide);
  const fieldGroups = interviewScoreFieldGroups(guide);
  const scaleMax = interviewScaleMax(guide);

  return (
    <div className="space-y-8">
      {noteQuestions.length > 0 ? (
        <section className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {guide?.format === 'case_and_behavioral' ? 'Part 1: Case questions' : 'Case questions'}
          </p>
          {noteQuestions.map((question, index) => (
            <Card key={`${index}-${question.slice(0, 32)}`} className="gap-4 p-6">
              <p className="text-sm leading-relaxed text-foreground">{question}</p>
              <textarea
                value={notes[question] ?? ''}
                onChange={(e) => onNoteChange(question, e.target.value)}
                disabled={disabled}
                rows={4}
                placeholder="Write notes for this question…"
                className="field-textarea resize-y disabled:opacity-60"
              />
            </Card>
          ))}
        </section>
      ) : null}

      <InterviewQuestionGroups
        groups={fieldGroups}
        notes={notes}
        scores={scores}
        disabled={disabled}
        scaleMax={scaleMax}
        onNoteChange={onNoteChange}
        onScoreChange={onScoreChange}
      />

      <Card className="gap-4 p-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Overall notes
        </p>
        <textarea
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          disabled={disabled}
          placeholder="Anything else from the interview (not visible to other stages until deliberations)"
          rows={3}
          className="field-textarea resize-none disabled:opacity-60"
        />
      </Card>
    </div>
  );
}
