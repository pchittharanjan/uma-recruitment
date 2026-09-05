'use client';

import { useEffect, useState } from 'react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import { ResponseText } from '@/components/response-text';
import { Skeleton } from '@/components/ui/skeleton';
import { cachedJsonFetch } from '@/lib/client-fetch-cache';
import { displayLabelForScoreField } from '@/lib/grading-model';
import { cn } from '@/lib/utils';

interface QuestionReview {
  id: string;
  label: string;
  responses: Array<{ field: string; value: string }>;
  criteria: Array<{ key: string; name: string; score: number | null }>;
  note: string | null;
  graderNotes: Array<{ graderName: string; note: string; isMine: boolean }>;
  graderScores: Array<{
    graderName: string;
    isMine: boolean;
    criteria: Array<{ key: string; name: string; score: number | null }>;
  }>;
}

interface GraderReview {
  graderName: string;
  status: string;
  comment: string | null;
  questionNotes: Array<{ label: string; note: string }>;
  scores: Record<string, number>;
  average: number | null;
  isMine: boolean;
}

interface ApplicationDetailData {
  displayId: string | null;
  candidateName: string | null;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string | null;
  questionNotes: Array<{ label: string; note: string }>;
  questionReviews: QuestionReview[] | null;
  graderReviews: GraderReview[];
  scoreFields: string[];
  customScoreFields: string[];
  scoreFieldLabels: Record<string, string>;
  blind: boolean;
  error?: string;
}

export function advancementDetailUrl(teamId: string, applicationId: number): string {
  // v=3: all graders' notes visible during color selection.
  return `/api/team/advancement/${applicationId}?teamId=${teamId}&fromStage=application&v=3`;
}

/** Warm the short-lived client cache before expand (e.g. on hover). */
export function prefetchAdvancementDetail(teamId: string, applicationId: number): void {
  void cachedJsonFetch(advancementDetailUrl(teamId, applicationId));
}

function ReviewerHeading({
  name,
  isMine,
  average,
}: {
  name: string;
  isMine: boolean;
  average?: number | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="min-w-0 font-medium text-foreground">
        {name}
        {isMine ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
        ) : null}
      </p>
      {average != null ? (
        <p className="shrink-0 tabular-nums text-sm font-medium text-foreground">
          {average.toFixed(2)}
        </p>
      ) : null}
    </div>
  );
}

export function ApplicationAdvancementDetailPanel({
  teamId,
  applicationId,
}: {
  teamId: string;
  applicationId: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<ApplicationDetailData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    cachedJsonFetch<ApplicationDetailData>(advancementDetailUrl(teamId, applicationId))
      .then(({ ok, json }) => {
        if (cancelled || !json) return;
        if (!ok) {
          setError(json.error ?? 'Failed to load application.');
          return;
        }
        setData({
          displayId: json.displayId ?? null,
          candidateName: json.candidateName ?? null,
          fields: json.fields ?? {},
          existingScores: json.existingScores ?? {},
          existingComment: json.existingComment ?? null,
          questionNotes: json.questionNotes ?? [],
          questionReviews: json.questionReviews ?? null,
          graderReviews: json.graderReviews ?? [],
          scoreFields: json.scoreFields ?? [],
          customScoreFields: json.customScoreFields ?? [],
          scoreFieldLabels: json.scoreFieldLabels ?? {},
          blind: Boolean(json.blind),
        });
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load application.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [teamId, applicationId]);

  if (loading) {
    return (
      <div className="space-y-3 px-1 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="px-1 py-3 text-sm text-destructive">{error}</p>;
  }

  if (!data) return null;

  const questionReviews = data.questionReviews;
  const useQuestionLayout = (questionReviews?.length ?? 0) > 0;
  const leftoverFields = Object.keys(data.fields).length > 0;
  const graderReviews = data.graderReviews ?? [];

  return (
    <div className="min-w-0 space-y-4 px-1 py-3 text-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Applicant
        </p>
        <p className="mt-1 font-medium text-foreground">
          {data.candidateName ?? data.displayId}
        </p>
        {data.candidateName && data.displayId ? (
          <p className="text-xs text-muted-foreground">{data.displayId}</p>
        ) : null}
      </div>

      {useQuestionLayout ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Written responses
          </p>
          {questionReviews!.map((review) => {
            const hasGraderScores = review.graderScores?.some((g) =>
              g.criteria.some((c) => c.score != null),
            );
            const hasGraderNotes = (review.graderNotes?.length ?? 0) > 0;
            return (
              <div key={review.id} className="display-panel min-w-0 space-y-3 p-4">
                <p className="text-sm font-semibold text-foreground/80">{review.label}</p>

                {review.responses.length > 0 ? (
                  <div className="space-y-3">
                    {review.responses.map((response) => (
                      <div key={response.field}>
                        {review.responses.length > 1 ? (
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {response.field}
                          </p>
                        ) : null}
                        <div className="whitespace-pre-wrap text-base text-foreground">
                          {response.value.trim() ? (
                            <ResponseText text={response.value} />
                          ) : (
                            <span className="italic text-muted-foreground">No response</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {hasGraderScores ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Scores</p>
                    {review.graderScores.map((grader) => {
                      const scored = grader.criteria.filter((c) => c.score != null);
                      if (scored.length === 0) return null;
                      return (
                        <div
                          key={grader.graderName}
                          className={cn(
                            'min-w-0 rounded-md bg-muted/45',
                            grader.isMine && 'ring-1 ring-border',
                          )}
                        >
                          <div className="border-b border-border/40 px-3 py-2">
                            <ReviewerHeading name={grader.graderName} isMine={grader.isMine} />
                          </div>
                          <div className="divide-y divide-border/40">
                            {scored.map((criterion) => (
                              <div
                                key={criterion.key}
                                className="flex items-start gap-3 px-3 py-2.5"
                              >
                                <p className="min-w-0 flex-1 break-words text-sm font-medium text-muted-foreground">
                                  {criterion.name}
                                </p>
                                <p className="shrink-0 tabular-nums font-medium">
                                  {criterion.score}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {hasGraderNotes ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Notes</p>
                    {review.graderNotes.map((entry) => (
                      <div
                        key={`${entry.graderName}-${entry.note.slice(0, 12)}`}
                        className="display-field px-3 py-2"
                      >
                        <ReviewerHeading name={entry.graderName} isMine={entry.isMine} />
                        <p className="mt-1 whitespace-pre-wrap text-foreground">{entry.note}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!useQuestionLayout && graderReviews.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Grader notes & scores
          </p>
          {graderReviews.map((grader) => {
            const scoreEntries = Object.entries(grader.scores);
            return (
              <div key={grader.graderName} className="display-field space-y-2 px-3 py-2">
                <ReviewerHeading
                  name={grader.graderName}
                  isMine={grader.isMine}
                  average={grader.average}
                />
                {scoreEntries.length > 0 ? (
                  <div className="divide-y divide-border/40 rounded-md bg-muted/45">
                    {scoreEntries.map(([field, score]) => (
                      <div key={field} className="flex items-start gap-3 px-3 py-2.5">
                        <p className="min-w-0 flex-1 break-words text-sm font-medium text-muted-foreground">
                          {displayLabelForScoreField(field, data.scoreFieldLabels)}
                        </p>
                        <p className="shrink-0 tabular-nums font-medium">{score}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {grader.questionNotes.map((entry) => (
                  <div key={entry.label}>
                    <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{entry.note}</p>
                  </div>
                ))}
                {grader.comment?.trim() ? (
                  <p className="whitespace-pre-wrap text-foreground">{grader.comment}</p>
                ) : !grader.questionNotes.length && scoreEntries.length === 0 ? (
                  <p className="text-muted-foreground italic">No notes recorded.</p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {useQuestionLayout && graderReviews.some((g) => g.comment?.trim()) ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overall comments
          </p>
          {graderReviews.map((grader) =>
            grader.comment?.trim() ? (
              <div key={grader.graderName} className="display-field px-3 py-2">
                <ReviewerHeading name={grader.graderName} isMine={grader.isMine} />
                <p className="mt-1 whitespace-pre-wrap text-foreground">{grader.comment}</p>
              </div>
            ) : null,
          )}
        </div>
      ) : null}

      {!useQuestionLayout && graderReviews.length === 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Overall comments
          </p>
          <p className="mt-1 text-muted-foreground italic">No overall comments recorded.</p>
        </div>
      ) : null}

      {leftoverFields ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {useQuestionLayout
              ? 'Other application fields'
              : data.blind
                ? 'Application responses'
                : 'Application'}
          </p>
          <ApplicationFieldsList fields={data.fields} blind={data.blind} />
        </div>
      ) : null}
    </div>
  );
}
