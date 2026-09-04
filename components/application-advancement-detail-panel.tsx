'use client';

import { useEffect, useState } from 'react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import { ResponseText } from '@/components/response-text';
import { Skeleton } from '@/components/ui/skeleton';
import { cachedJsonFetch } from '@/lib/client-fetch-cache';
import { displayLabelForScoreField } from '@/lib/grading-model';

interface QuestionReview {
  id: string;
  label: string;
  responses: Array<{ field: string; value: string }>;
  criteria: Array<{ key: string; name: string; score: number | null }>;
  note: string | null;
}

interface ApplicationDetailData {
  displayId: string | null;
  candidateName: string | null;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string | null;
  questionNotes: Array<{ label: string; note: string }>;
  questionReviews: QuestionReview[] | null;
  scoreFields: string[];
  customScoreFields: string[];
  scoreFieldLabels: Record<string, string>;
  blind: boolean;
  error?: string;
}

export function advancementDetailUrl(teamId: string, applicationId: number): string {
  // v=2: question-grouped scores + responses (also busts older client cache).
  return `/api/team/advancement/${applicationId}?teamId=${teamId}&fromStage=application&v=2`;
}

/** Warm the short-lived client cache before expand (e.g. on hover). */
export function prefetchAdvancementDetail(teamId: string, applicationId: number): void {
  void cachedJsonFetch(advancementDetailUrl(teamId, applicationId));
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
  const scoreFields = [...data.scoreFields, ...data.customScoreFields];
  const hasFlatScores =
    !useQuestionLayout &&
    scoreFields.some((field) => data.existingScores[field] !== undefined);
  const leftoverFields = Object.keys(data.fields).length > 0;

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
            const scoredCriteria = review.criteria.filter((c) => c.score != null);
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

                {scoredCriteria.length > 0 ? (
                  <div className="min-w-0 divide-y divide-border/40 rounded-md bg-muted/45">
                    {scoredCriteria.map((criterion) => (
                      <div
                        key={criterion.key}
                        className="flex items-start gap-3 px-3 py-2.5"
                      >
                        <p className="min-w-0 flex-1 break-words text-sm font-medium text-muted-foreground">
                          {criterion.name}
                        </p>
                        <p className="shrink-0 tabular-nums font-medium">{criterion.score}</p>
                      </div>
                    ))}
                  </div>
                ) : null}

                {review.note ? (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Your notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-foreground">{review.note}</p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {hasFlatScores && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your scores
          </p>
          <div className="min-w-0 divide-y divide-border/40 rounded-md bg-muted/45">
            {scoreFields.map((field) => {
              const score = data.existingScores[field];
              if (score === undefined) return null;
              return (
                <div key={field} className="flex items-start gap-3 px-3 py-2.5">
                  <p className="min-w-0 flex-1 break-words text-sm font-medium text-muted-foreground">
                    {displayLabelForScoreField(field, data.scoreFieldLabels)}
                  </p>
                  <p className="shrink-0 tabular-nums font-medium">{score}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!useQuestionLayout && data.questionNotes?.length ? (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your question notes
          </p>
          <div className="space-y-3">
            {data.questionNotes.map((entry) => (
              <div key={entry.label}>
                <p className="text-xs font-medium text-muted-foreground">{entry.label}</p>
                <p className="mt-1 whitespace-pre-wrap text-foreground">{entry.note}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Overall comments
        </p>
        {data.existingComment?.trim() ? (
          <p className="display-field mt-1 whitespace-pre-wrap text-foreground">
            {data.existingComment}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground italic">No overall comments recorded.</p>
        )}
      </div>

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
