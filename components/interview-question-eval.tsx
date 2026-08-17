'use client';

import ScoreSelector from '@/components/ScoreSelector';
import { Card } from '@/components/ui/card';
import { RequiredAsterisk } from '@/components/ui/label';
import type { InterviewScoreFieldGroup } from '@/lib/interview-guide';

export function InterviewQuestionEval({
  question,
  note,
  score,
  disabled,
  onNoteChange,
  onScoreChange,
}: {
  question: string;
  note: string;
  score: number | null;
  disabled?: boolean;
  onNoteChange: (value: string) => void;
  onScoreChange: (value: number) => void;
}) {
  return (
    <Card className="gap-4 p-4">
      <p className="text-sm leading-relaxed text-foreground">{question}</p>
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        disabled={disabled}
        rows={4}
        placeholder="Write notes for this question…"
        className="w-full resize-y rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
      />
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          Rate their response on a scale of 1–5
          <RequiredAsterisk className="ml-0.5" />
        </p>
        <ScoreSelector value={score} onChange={onScoreChange} disabled={disabled} />
      </div>
    </Card>
  );
}

export function InterviewQuestionGroups({
  groups,
  notes,
  scores,
  disabled,
  onNoteChange,
  onScoreChange,
}: {
  groups: InterviewScoreFieldGroup[];
  notes: Record<string, string>;
  scores: Record<string, number>;
  disabled?: boolean;
  onNoteChange: (field: string, value: string) => void;
  onScoreChange: (field: string, value: number) => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          {group.label ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          {group.fields.map((field) => (
            <InterviewQuestionEval
              key={field}
              question={field}
              note={notes[field] ?? ''}
              score={scores[field] ?? null}
              disabled={disabled}
              onNoteChange={(value) => onNoteChange(field, value)}
              onScoreChange={(value) => onScoreChange(field, value)}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
