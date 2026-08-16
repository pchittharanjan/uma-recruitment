'use client';

import { useEffect, useState } from 'react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import { Skeleton } from '@/components/ui/skeleton';

interface ApplicationDetailData {
  displayId: string | null;
  candidateName: string | null;
  fields: Record<string, string>;
  existingScores: Record<string, number>;
  existingComment: string | null;
  scoreFields: string[];
  customScoreFields: string[];
  blind: boolean;
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

    fetch(`/api/team/advancement/${applicationId}?teamId=${teamId}&fromStage=application`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Failed to load application.');
          return;
        }
        setData({
          displayId: json.displayId ?? null,
          candidateName: json.candidateName ?? null,
          fields: json.fields ?? {},
          existingScores: json.existingScores ?? {},
          existingComment: json.existingComment ?? null,
          scoreFields: json.scoreFields ?? [],
          customScoreFields: json.customScoreFields ?? [],
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

  const scoreFields = [...data.scoreFields, ...data.customScoreFields];
  const hasScores = scoreFields.some((field) => data.existingScores[field] !== undefined);

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

      {hasScores && (
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
                    {field}
                  </p>
                  <p className="shrink-0 tabular-nums font-medium">{score}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Your notes
        </p>
        {data.existingComment?.trim() ? (
          <p className="display-field mt-1 whitespace-pre-wrap text-foreground">
            {data.existingComment}
          </p>
        ) : (
          <p className="mt-1 text-muted-foreground italic">No notes recorded.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {data.blind ? 'Application responses' : 'Application'}
        </p>
        <ApplicationFieldsList fields={data.fields} />
      </div>
    </div>
  );
}
