'use client';

import { Fragment, useEffect, useState } from 'react';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import StageBadge from '@/components/stage-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { displayApplicantId } from '@/lib/applicant-id';
import { cachedJsonFetch } from '@/lib/client-fetch-cache';
import type { DeliberationsCandidateDetail } from '@/lib/deliberations-types';
import type { ApplicationStage } from '@/lib/db';
import { displayLabelForScoreField, parseCriterionScoreKey } from '@/lib/grading-model';
import { applicationStageLabel } from '@/lib/stages';
import { cn } from '@/lib/utils';

export function prefetchDeliberationsDetail(url: string): void {
  void cachedJsonFetch(url);
}

export function formatDeliberationsScore(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
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

export type DeliberationsPhaseScoreKey = 'application' | 'firstRound' | 'finalRound';

export function DeliberationsPhaseScoreChips({
  application,
  firstRound,
  finalRound,
  onSelectPhase,
}: {
  application: number | null;
  firstRound: number | null;
  finalRound: number | null;
  onSelectPhase?: (phase: DeliberationsPhaseScoreKey) => void;
}) {
  const chipClassName = cn(
    'inline-flex min-w-[7.5rem] items-center justify-between gap-3 rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm font-semibold text-white',
    onSelectPhase && 'cursor-pointer transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  const chips: Array<{ phase: DeliberationsPhaseScoreKey; label: string; value: number | null }> = [
    { phase: 'application', label: 'Application', value: application },
    { phase: 'firstRound', label: 'First', value: firstRound },
    { phase: 'finalRound', label: 'Final', value: finalRound },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(({ phase, label, value }) => {
        const content = (
          <>
            <span>{label}</span>
            <span className="tabular-nums">{formatDeliberationsScore(value)}</span>
          </>
        );

        if (onSelectPhase) {
          return (
            <button
              key={phase}
              type="button"
              className={chipClassName}
              onClick={() => onSelectPhase(phase)}
            >
              {content}
            </button>
          );
        }

        return (
          <Badge key={phase} className={chipClassName}>
            {content}
          </Badge>
        );
      })}
    </div>
  );
}

type ScoreGroup = {
  id: string;
  label: string;
  criteria: Array<{ key: string; name: string }>;
};

/** Union of question → criteria across reviewers (labels once; scores looked up by key). */
function buildScoreMatrixStructure(
  reviews: DeliberationsCandidateDetail['applicationReviews'],
  scoreFieldLabels: Record<string, string>,
): ScoreGroup[] {
  const groups = new Map<string, ScoreGroup>();
  const order: string[] = [];
  const seenCriteria = new Map<string, Set<string>>();

  for (const review of reviews) {
    for (const field of Object.keys(review.scores)) {
      const fullLabel = displayLabelForScoreField(field, scoreFieldLabels);
      const parsed = parseCriterionScoreKey(field);
      const separator = fullLabel.indexOf(' · ');
      const questionLabel =
        separator > 0 ? fullLabel.slice(0, separator).trim() : parsed?.questionId ?? 'Scores';
      const criterionName =
        separator > 0 ? fullLabel.slice(separator + 3).trim() : fullLabel;
      const groupId = parsed?.questionId ?? questionLabel;

      let group = groups.get(groupId);
      if (!group) {
        group = { id: groupId, label: questionLabel, criteria: [] };
        groups.set(groupId, group);
        order.push(groupId);
        seenCriteria.set(groupId, new Set());
      }
      const seen = seenCriteria.get(groupId)!;
      if (seen.has(field)) continue;
      seen.add(field);
      group.criteria.push({ key: field, name: criterionName || fullLabel });
    }
  }

  return order.map((id) => groups.get(id)!);
}

function shortReviewerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim() || 'Reviewer';
  return parts[0]!;
}

function noteMatchesGroup(noteLabel: string, group: ScoreGroup): boolean {
  const normalizedGroup = group.label.replace(/\s*\(max\b[^)]*\)\s*$/i, '').trim();
  const normalizedNote = noteLabel.replace(/\s*\(max\b[^)]*\)\s*$/i, '').trim();
  return (
    noteLabel === group.label ||
    noteLabel === group.id ||
    normalizedNote === normalizedGroup ||
    normalizedNote.startsWith(normalizedGroup) ||
    normalizedGroup.startsWith(normalizedNote)
  );
}

export function DeliberationsReviewsSection({
  title,
  reviews,
  scoreFieldLabels,
}: {
  title: string;
  reviews: DeliberationsCandidateDetail['applicationReviews'];
  scoreFieldLabels: Record<string, string>;
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

  const groups = buildScoreMatrixStructure(reviews, scoreFieldLabels);
  const hasAnyScores = groups.some((group) => group.criteria.length > 0);
  const hasNotesOrComments = reviews.some(
    (review) =>
      Boolean(review.comment?.trim()) ||
      Object.values(review.notes ?? {}).some((note) => note.trim()),
  );

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
        {title}
      </p>

      {hasAnyScores ? (
        <div className="overflow-x-auto rounded-md border border-border bg-background">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Criterion
                </th>
                {reviews.map((review, index) => (
                  <th
                    key={`${review.reviewerName}-${index}`}
                    className="px-2 py-2 text-center text-xs font-semibold text-foreground"
                    title={`${review.reviewerName} · ${review.status}`}
                  >
                    <span className="block truncate">{shortReviewerName(review.reviewerName)}</span>
                    <span className="mt-0.5 block tabular-nums text-foreground/70">
                      {formatDeliberationsScore(review.average)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.id}>
                  <tr className="border-b border-border bg-muted/25">
                    <td
                      colSpan={reviews.length + 1}
                      className="px-3 py-2 text-sm font-semibold text-foreground"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.criteria.map((criterion) => (
                    <tr
                      key={criterion.key}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <td className="px-3 py-2 text-foreground/80">{criterion.name}</td>
                      {reviews.map((review, index) => {
                        const score = review.scores[criterion.key];
                        return (
                          <td
                            key={`${review.reviewerName}-${index}-${criterion.key}`}
                            className="px-2 py-2 text-center tabular-nums font-semibold text-foreground"
                          >
                            {score != null && Number.isFinite(score) ? score : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm italic text-muted-foreground">No criterion scores recorded.</p>
      )}

      {hasNotesOrComments ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
            Comments & notes
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reviews.map((review, index) => {
              const notes = Object.entries(review.notes ?? {}).filter(([, note]) =>
                note.trim(),
              );
              const comment = review.comment?.trim() ?? '';
              if (!comment && notes.length === 0) return null;

              return (
                <div
                  key={`${review.reviewerName}-notes-${index}`}
                  className="display-panel space-y-2 px-3 py-3"
                >
                  <p className="truncate text-sm font-semibold text-foreground">
                    {review.reviewerName}
                  </p>
                  {comment ? (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Overall</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                        {comment}
                      </p>
                    </div>
                  ) : null}
                  {notes.map(([label, note]) => {
                    const group = groups.find((item) => noteMatchesGroup(label, item));
                    return (
                      <div key={label}>
                        <p className="text-xs font-medium text-muted-foreground">
                          {group?.label ?? label}
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
                          {note}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
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

    cachedJsonFetch<{
      detail?: DeliberationsCandidateDetail;
      error?: string;
    }>(url)
      .then(({ ok, json }) => {
        if (cancelled || !json) return;
        if (!ok || !json.detail) {
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
            size="compact"
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
        <DeliberationsPhaseScoreChips
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

      <DeliberationsReviewsSection
        title="Application Scores"
        reviews={detail.applicationReviews}
        scoreFieldLabels={detail.scoreFieldLabels ?? {}}
      />
      <DeliberationsReviewsSection
        title="First Round Interviews"
        reviews={detail.firstRoundReviews}
        scoreFieldLabels={detail.scoreFieldLabels ?? {}}
      />
      <DeliberationsReviewsSection
        title="Final Round Interviews"
        reviews={detail.finalRoundReviews}
        scoreFieldLabels={detail.scoreFieldLabels ?? {}}
      />

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
