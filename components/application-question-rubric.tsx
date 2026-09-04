import type { ReactNode } from 'react';
import ScoreSelector from '@/components/ScoreSelector';
import { PortfolioLinkPreview } from '@/components/portfolio-link-preview';
import { RequiredAsterisk } from '@/components/ui/label';
import type { RubricCriterion, RubricQuestion } from '@/lib/grading-model-types';
import { firstHttpUrl, restAfterFirstUrl } from '@/lib/link-preview';
import { anchorForScore, responseFieldsForQuestion } from '@/lib/grading-model';
import { cn } from '@/lib/utils';

interface Props {
  question: RubricQuestion;
  /** Extra questions scored together with this primary (responses only). */
  linkedQuestions?: RubricQuestion[];
  scores: Record<string, number>;
  notes?: string;
  activeField: string | null;
  disabled?: boolean;
  onScore: (fieldKey: string, score: number) => void;
  onNotesChange?: (value: string) => void;
  renderResponse: (text: string) => ReactNode;
  fields: Record<string, string>;
  /** Hide Drive/Docs “open” so file names cannot identify the applicant. */
  blind?: boolean;
}

function fieldKey(questionId: string, criterionId: string): string {
  return `${questionId}::${criterionId}`;
}

function ResponseBlock({
  question,
  fields,
  renderResponse,
  showLabel,
  blind,
}: {
  question: RubricQuestion;
  fields: Record<string, string>;
  renderResponse: (text: string) => ReactNode;
  showLabel: boolean;
  blind: boolean;
}) {
  const responseFields = responseFieldsForQuestion(question);

  return (
    <div>
      {showLabel ? (
        <p className="mb-2 uma-section-label text-primary">{question.label}</p>
      ) : null}
      {responseFields.length === 0 ? (
        <p className="text-sm italic text-muted-foreground">No response column</p>
      ) : (
        responseFields.map((field, index) => {
          const val = fields[field] ?? '';
          const leadingUrl = firstHttpUrl(val);
          const rest = leadingUrl ? restAfterFirstUrl(val) : '';
          const isLast = index === responseFields.length - 1;
          return (
            <div key={field} className={cn(!isLast && 'mb-3')}>
              {responseFields.length > 1 && (
                <p className="mb-1 text-xs font-medium text-muted-foreground">{field}</p>
              )}
              <div className="whitespace-pre-wrap text-[length:var(--text-ui-base)] leading-relaxed text-foreground">
                {val ? (
                  leadingUrl ? (
                    <div className="space-y-3">
                      <PortfolioLinkPreview url={leadingUrl} compact blind={blind} />
                      {rest ? renderResponse(rest) : null}
                    </div>
                  ) : (
                    renderResponse(val)
                  )
                ) : (
                  <span className="italic text-muted-foreground">No response</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function CriterionRow({
  question,
  criterion,
  value,
  isActive,
  disabled,
  onScore,
}: {
  question: RubricQuestion;
  criterion: RubricCriterion;
  value: number | null;
  isActive: boolean;
  disabled?: boolean;
  onScore: (score: number) => void;
}) {
  const key = fieldKey(question.id, criterion.id);
  const anchor = value != null ? anchorForScore(criterion, value) : null;

  return (
    <div
      data-score-field={key}
      className={cn(
        'rounded-lg border border-foreground/20 bg-muted/40 p-4',
        isActive && !disabled && 'ring-2 ring-primary/40',
      )}
    >
      <p className="mb-1 text-sm font-medium">
        {criterion.name}
        {criterion.weightPct != null && (
          <span className="ml-1 font-normal text-muted-foreground">({criterion.weightPct}%)</span>
        )}
        <RequiredAsterisk className="ml-0.5" />
      </p>
      <div className="mb-3">
        <ScoreSelector value={value} onChange={onScore} disabled={disabled} />
      </div>
      {anchor ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{anchor}</p>
      ) : (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Scoring guide</summary>
          <ul className="mt-2 space-y-1.5 pl-1">
            {criterion.anchors.map((a) => (
              <li key={a.score}>
                <span className="font-medium tabular-nums">{a.score}:</span> {a.description}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function ApplicationQuestionRubricCard({
  question,
  linkedQuestions = [],
  scores,
  notes = '',
  activeField,
  disabled,
  onScore,
  onNotesChange,
  renderResponse,
  fields,
  blind = true,
}: Props) {
  const responseBlocks = [question, ...linkedQuestions];
  const multiResponse = responseBlocks.length > 1;
  const notesId = `question-notes-${question.id}`;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-foreground/20 bg-[var(--surface-raised)] px-4 py-3.5 sm:px-5 sm:py-4">
        {multiResponse ? (
          <div className="space-y-4">
            {responseBlocks.map((q) => (
              <ResponseBlock
                key={q.id}
                question={q}
                fields={fields}
                renderResponse={renderResponse}
                showLabel
                blind={blind}
              />
            ))}
          </div>
        ) : (
          <ResponseBlock
            question={question}
            fields={fields}
            renderResponse={renderResponse}
            showLabel
            blind={blind}
          />
        )}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <div className="order-2 space-y-3 sm:order-1">
          <div className="flex items-center gap-3">
            <p className="shrink-0 uma-section-label">Score</p>
            <div className="h-px min-w-0 flex-1 bg-foreground/20" aria-hidden />
          </div>
          {question.criteria.map((criterion) => {
            const key = fieldKey(question.id, criterion.id);
            return (
              <CriterionRow
                key={key}
                question={question}
                criterion={criterion}
                value={scores[key] ?? null}
                isActive={activeField === key}
                disabled={disabled}
                onScore={(n) => onScore(key, n)}
              />
            );
          })}
        </div>

        <div className="order-1 flex h-full min-h-[11rem] min-w-0 flex-col sm:order-2">
          <div className="mb-2 flex items-center gap-3">
            <label htmlFor={notesId} className="shrink-0 uma-section-label">
              Notes
            </label>
            <div className="h-px min-w-0 flex-1 bg-foreground/20" aria-hidden />
          </div>
          <textarea
            id={notesId}
            value={notes}
            onChange={(e) => onNotesChange?.(e.target.value)}
            placeholder="Notes for this question…"
            rows={6}
            disabled={disabled}
            readOnly={!onNotesChange}
            className="field-textarea min-h-[11rem] w-full flex-1 resize-y border-foreground/20 disabled:opacity-60"
          />
        </div>
      </div>
    </div>
  );
}
