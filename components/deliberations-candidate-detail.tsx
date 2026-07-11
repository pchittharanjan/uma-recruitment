'use client';

import { useEffect, useState } from 'react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import StageBadge from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { displayApplicantId } from '@/lib/applicant-id';
import type { DeliberationsCandidateDetail } from '@/lib/deliberations-types';
import type { ApplicationStage } from '@/lib/db';
import { applicationStageLabel } from '@/lib/stages';
import { cn } from '@/lib/utils';

function formatScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function stageBadgeColor(stage: string): 'blue' | 'green' | 'gray' | 'yellow' | 'orange' {
  switch (stage as ApplicationStage) {
    case 'advanced':
      return 'green';
    case 'rejected':
      return 'orange';
    case 'application':
      return 'blue';
    case 'first_round':
    case 'final_round':
      return 'yellow';
    default:
      return 'gray';
  }
}

function PhaseScoreChips({
  application,
  firstRound,
  finalRound,
}: {
  application: number | null;
  firstRound: number | null;
  finalRound: number | null;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="rounded border border-zinc-800 bg-zinc-900 font-semibold tabular-nums text-white">
        Application {formatScore(application)}
      </Badge>
      <Badge className="rounded border border-zinc-800 bg-zinc-900 font-semibold tabular-nums text-white">
        First {formatScore(firstRound)}
      </Badge>
      <Badge className="rounded border border-zinc-800 bg-zinc-900 font-semibold tabular-nums text-white">
        Final {formatScore(finalRound)}
      </Badge>
    </div>
  );
}

function ReviewsSection({
  title,
  reviews,
}: {
  title: string;
  reviews: DeliberationsCandidateDetail['applicationReviews'];
}) {
  if (reviews.length === 0) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          {title}
        </p>
        <p className="text-sm italic text-muted-foreground">No scores recorded.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </p>
      <div className="space-y-3">
        {reviews.map((review, index) => (
          <div
            key={`${review.reviewerName}-${index}`}
            className="rounded-md border border-border bg-card px-3 py-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {review.reviewerName}
                </p>
                <p className="text-sm capitalize text-foreground/70">{review.status}</p>
              </div>
              <p className="shrink-0 tabular-nums text-sm font-semibold text-foreground">
                {formatScore(review.average)}
              </p>
            </div>
            {Object.keys(review.scores).length > 0 && (
              <div className="mt-2 divide-y divide-border rounded-md border border-border bg-muted/30">
                {Object.entries(review.scores).map(([field, score]) => (
                  <div key={field} className="flex items-start gap-3 px-2.5 py-2">
                    <p className="min-w-0 flex-1 break-words text-sm font-medium text-foreground/80">
                      {field}
                    </p>
                    <p className="shrink-0 tabular-nums text-sm font-semibold text-foreground">
                      {score}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {review.comment?.trim() ? (
              <p className="mt-2 whitespace-pre-wrap text-base text-foreground">{review.comment}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeliberationsCandidateDetailPanel({
  teamId,
  teamName,
  applicationId,
  rejected,
  onToggleRejected,
  detailUrl,
  initialDetail,
}: {
  teamId: number;
  teamName: string;
  applicationId: number;
  rejected: boolean;
  onToggleRejected: () => void;
  /** Override detail GET URL (team portal uses /api/team/...). */
  detailUrl?: string;
  /** When provided (e.g. from compare batch), skip the individual fetch. */
  initialDetail?: DeliberationsCandidateDetail | null;
}) {
  const [loading, setLoading] = useState(!initialDetail);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<DeliberationsCandidateDetail | null>(
    initialDetail ?? null,
  );
  const url =
    detailUrl ?? `/api/admin/teams/${teamId}/deliberations/${applicationId}`;

  useEffect(() => {
    if (initialDetail) {
      setDetail(initialDetail);
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);

    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const json = (await res.json()) as {
          detail?: DeliberationsCandidateDetail;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !json.detail) {
          setError(json.error ?? 'Failed to load applicant.');
          return;
        }
        setDetail(json.detail);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load applicant.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [url, initialDetail]);

  if (loading) {
    return (
      <div className="space-y-3 px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="px-4 py-3 text-sm text-destructive">{error}</p>;
  }

  if (!detail) return null;

  const metaParts = [
    `Row ${displayApplicantId(detail.rowIndex)}`,
    detail.email?.trim() || null,
    teamName,
  ].filter(Boolean);

  return (
    <div className="min-w-0 space-y-6 px-4 pb-6 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-sm text-foreground/80">{metaParts.join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge
            label={applicationStageLabel(detail.stage as ApplicationStage)}
            color={stageBadgeColor(detail.stage)}
          />
          {rejected ? (
            <Badge className="border-0 bg-red-600 font-medium text-white">Rejected</Badge>
          ) : null}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Phase scores
        </p>
        <PhaseScoreChips
          application={detail.phaseAverages.application}
          firstRound={detail.phaseAverages.firstRound}
          finalRound={detail.phaseAverages.finalRound}
        />
      </div>

      <div>
        <Button
          type="button"
          size="sm"
          onClick={onToggleRejected}
          className={cn(
            rejected
              ? 'border border-red-600 bg-background text-red-700 hover:bg-red-50'
              : 'border border-red-700 bg-red-600 text-white hover:bg-red-700',
          )}
        >
          {rejected ? 'Undo reject' : 'Reject'}
        </Button>
      </div>

      {detail.adminNote?.trim() ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/70">
            Admin note
          </p>
          <p className="display-field whitespace-pre-wrap text-base text-foreground">
            {detail.adminNote}
          </p>
        </div>
      ) : null}

      {detail.flags.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
            Flags
          </p>
          <div className="space-y-2">
            {detail.flags.map((flag, index) => (
              <div
                key={`${flag.authorName}-${index}`}
                className={cn(
                  'rounded-md border px-3 py-2',
                  flag.color === 'red'
                    ? 'border-red-300 bg-red-50 text-red-950'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-950',
                )}
              >
                <p className="text-sm font-medium">
                  {flag.color === 'red' ? 'Red' : 'Green'} · {flag.authorName}
                </p>
                {flag.note?.trim() ? (
                  <p className="mt-1 whitespace-pre-wrap text-base">{flag.note}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ReviewsSection title="Application scores" reviews={detail.applicationReviews} />
      <ReviewsSection title="First round interviews" reviews={detail.firstRoundReviews} />
      <ReviewsSection title="Final round interviews" reviews={detail.finalRoundReviews} />

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Application
        </p>
        {Object.keys(detail.fields).length > 0 ? (
          <ApplicationFieldsList fields={detail.fields} />
        ) : (
          <p className="text-sm italic text-muted-foreground">No application fields.</p>
        )}
      </div>
    </div>
  );
}
