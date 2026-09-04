'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import PageLoading from '@/components/page-loading';
import StatusBanner from '@/components/status-banner';
import { AdvancementActivityLog } from '@/components/advancement-activity-log';
import { AdvancementRankColGroup } from '@/components/advancement-rank-table-columns';
import { ApplicationFieldsList } from '@/components/application-fields-list';
import { AvgScoreCell, AvgScoreHeader } from '@/components/avg-score-header';
import {
  AdvancementVerdictSelector,
  PanelVerdictSummary,
  VerdictAccentBar,
  verdictRowClass,
  VERDICT_ACCENT_HEX,
} from '@/components/advancement-verdict-selector';
import type { AdvancementVerdict } from '@/lib/advancement-verdict-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdvancementFromStage, AdvancementSubmission } from '@/lib/advancement-submissions-types';
import { advancementFromStageLabel } from '@/lib/advancement-submissions-types';
import { advancementPageDescription } from '@/lib/advancement-cap-helpers';
import { AdvancementRatingGuide } from '@/components/advancement-rating-guide';
import { advancementRequiredStepIntro, advancementIncompleteReminder } from '@/lib/advancement-rating-copy';
import { displayApplicantId } from '@/lib/applicant-id';
import { applicantDisplayId } from '@/lib/blind';
import { advancementStepGuide } from '@/lib/next-step-guidance';
import { invalidateClientFetchCache } from '@/lib/client-fetch-cache';
import { cn } from '@/lib/utils';

interface ApplicantRow {
  applicationId: number;
  rowIndex: number;
  candidateName: string;
  average: number;
  rawAverage?: number;
  rank: number;
  adminVerdict: AdvancementVerdict | null;
  panelVerdicts: Array<{ name: string; verdict: AdvancementVerdict | null }>;
}

interface WorkspaceData {
  teamId: number;
  teamName?: string | null;
  fromStage: AdvancementFromStage;
  advancementCap: number | null;
  overCapExtra?: number;
  selectionMin?: number | null;
  selectionMax?: number | null;
  allowUncappedFirstRound?: boolean;
  preview: {
    applications: ApplicantRow[];
    incompleteCount: number;
    totalApplications: number;
  };
  submission: AdvancementSubmission | null;
  history: AdvancementSubmission[];
  readOnly?: boolean;
  canAct?: boolean;
}

function FinalAdvanceToggle({
  selected,
  atCap,
  label,
  onToggle,
}: {
  selected: boolean;
  atCap: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      aria-label={
        selected ? `Remove ${label} from advance list` : `Add ${label} to advance list`
      }
      disabled={atCap}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="min-w-[5.5rem]"
    >
      {selected ? 'Advancing' : 'Advance'}
    </Button>
  );
}

function AdminApplicationExpand({
  teamId,
  applicationId,
  rowIndex,
}: {
  teamId: string | number;
  applicationId: number;
  rowIndex: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setFields(null);

    fetch(`/api/admin/applications/${applicationId}`, { cache: 'no-store' })
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? 'Failed to load application.');
          return;
        }
        setFields((json.application?.fields as Record<string, string>) ?? {});
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
  }, [applicationId]);

  if (loading) {
    return (
      <div className="space-y-3 px-1 py-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="px-1 py-2 text-sm text-destructive">{error}</p>;
  }

  return (
    <div className="space-y-3 px-1 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {applicantDisplayId(rowIndex)} · application responses
        </p>
        <Link
          href={`/admin/teams/${teamId}/grader-preview/${applicationId}`}
          className="text-xs text-primary hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open grader preview
        </Link>
      </div>
      {fields && Object.keys(fields).length > 0 ? (
        <ApplicationFieldsList fields={fields} />
      ) : (
        <p className="text-sm italic text-muted-foreground">No application fields found.</p>
      )}
    </div>
  );
}

export function AdminTeamAdvancementPanel({
  teamId,
  fromStage,
  teamName,
}: {
  teamId: string | number;
  fromStage: AdvancementFromStage;
  teamName?: string;
}) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState('');
  const [verdicts, setVerdicts] = useState<Record<number, AdvancementVerdict>>({});
  const [finalSelection, setFinalSelection] = useState<Set<number>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchData = useCallback(async () => {
    const res = await fetch(
      `/api/admin/teams/${teamId}/advancement?fromStage=${fromStage}`,
      { cache: 'no-store' },
    );
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? 'Failed to load advancement workspace.');
      return;
    }
    setData(json);
    const nextVerdicts: Record<number, AdvancementVerdict> = {};
    for (const app of json.preview.applications as ApplicantRow[]) {
      if (app.adminVerdict) nextVerdicts[app.applicationId] = app.adminVerdict;
    }
    if (
      json.submission?.status === 'submitted' ||
      json.submission?.status === 'approved'
    ) {
      setFinalSelection(
        new Set(
          (json.submission.candidates as Array<{ applicationId: number }>).map(
            (c) => c.applicationId,
          ),
        ),
      );
    } else {
      setFinalSelection(new Set());
    }
    setVerdicts(nextVerdicts);
  }, [fromStage, router, teamId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const advancementCap = data?.advancementCap ?? null;
  const overCapExtra = Math.max(0, Number(data?.overCapExtra) || 0);
  const allowUncappedFirstRound = Boolean(data?.allowUncappedFirstRound);
  const usesFinalSelection = advancementCap !== null || allowUncappedFirstRound;
  const minAdvanceCount = data?.selectionMin ?? 0;
  const maxAdvanceCount = data?.selectionMax ?? 0;
  const targetAdvanceCount = minAdvanceCount;
  const finalCount = finalSelection.size;

  const setVerdict = async (applicationId: number, verdict: AdvancementVerdict | null) => {
    const previous = verdicts[applicationId] ?? null;
    setVerdicts((prev) => {
      const next = { ...prev };
      if (verdict === null) delete next[applicationId];
      else next[applicationId] = verdict;
      return next;
    });

    try {
      const res = await fetch(
        `/api/admin/teams/${teamId}/advancement/verdict?fromStage=${fromStage}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ applicationId, verdict }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        setVerdicts((prev) => {
          const next = { ...prev };
          if (previous === null) delete next[applicationId];
          else next[applicationId] = previous;
          return next;
        });
        toast.error(json.error ?? 'Failed to save rating.');
      }
    } catch {
      setVerdicts((prev) => {
        const next = { ...prev };
        if (previous === null) delete next[applicationId];
        else next[applicationId] = previous;
        return next;
      });
      toast.error('Failed to save rating.');
    }
  };

  const toggleFinalAdvance = (applicationId: number, checked: boolean) => {
    setFinalSelection((prev) => {
      const next = new Set(prev);
      if (checked) {
        if (maxAdvanceCount > 0 && next.size >= maxAdvanceCount) return prev;
        next.add(applicationId);
      } else {
        next.delete(applicationId);
      }
      return next;
    });
  };

  const toggleExpanded = (applicationId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  };

  const selectTopToAdvance = (count: number) => {
    if (!data) return;
    const pool = [...data.preview.applications]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, count);
    setFinalSelection(new Set(pool.map((app) => app.applicationId)));
  };

  const clearFinalAdvance = () => setFinalSelection(new Set());

  const submitSelectionReady =
    minAdvanceCount > 0 &&
    maxAdvanceCount > 0 &&
    finalCount >= minAdvanceCount &&
    finalCount <= maxAdvanceCount;

  const handleApply = async (autoApprove: boolean) => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/advancement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromStage,
          applicationIds: [...finalSelection],
          autoApprove,
          force: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Submission failed.';
        setSubmitError(message);
        toast.error(message);
        return;
      }
      toast.success(
        autoApprove
          ? `Advanced ${finalCount} applicant${finalCount === 1 ? '' : 's'}`
          : 'Advancement list saved for approval',
      );
      invalidateClientFetchCache('/api/admin/advancements');
      await fetchData();
    } catch {
      setSubmitError('Submission failed.');
      toast.error('Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = data?.submission?.status === 'submitted';
  const isApproved = data?.submission?.status === 'approved';
  const isReadOnly = Boolean(data?.readOnly);
  const canAct = Boolean(data?.canAct && !isReadOnly && !isApproved);
  const canSubmitAdvancement = canAct && (advancementCap !== null || allowUncappedFirstRound);

  const displayRows = useMemo(() => {
    if (!data) return [];
    if (isApproved || (isReadOnly && data.submission)) {
      return data.submission!.candidates.map((c) => {
        const preview = data.preview.applications.find(
          (app) => app.applicationId === c.applicationId,
        );
        return {
          applicationId: c.applicationId,
          rowIndex: c.rowIndex,
          candidateName: c.candidateName,
          average: c.average,
          rawAverage: c.rawAverage,
          rank: c.rank,
          adminVerdict: preview?.adminVerdict ?? null,
          panelVerdicts: preview?.panelVerdicts ?? [],
        };
      });
    }
    return data.preview.applications;
  }, [data, isApproved, isReadOnly]);

  const submittedIdSet =
    isApproved || (isReadOnly && data?.submission)
      ? new Set(data!.submission!.candidates.map((c) => c.applicationId))
      : finalSelection;

  const displayVerdict = (applicationId: number): AdvancementVerdict | null => {
    if (isApproved || (isReadOnly && data?.submission)) {
      return submittedIdSet.has(applicationId) ? 'green' : null;
    }
    return verdicts[applicationId] ?? null;
  };

  if (error) {
    return <StatusBanner type="error" message={error} />;
  }

  if (!data) return <PageLoading />;

  const resolvedTeamName = data.teamName ?? teamName;
  const stageLabel = advancementFromStageLabel(fromStage, resolvedTeamName ?? undefined);
  // rating? + rank + applicant + application + score + panel + advance?
  const detailColSpan =
    (canAct && !isApproved ? 1 : 0) + 5 + (canSubmitAdvancement ? 1 : 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-2">
          <CardTitle className="text-base">
            Admin advancement — {stageLabel}
          </CardTitle>
          <CardDescription>
            {advancementPageDescription(
              fromStage,
              data.preview.totalApplications,
              advancementCap,
              overCapExtra,
              resolvedTeamName ?? undefined,
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusBanner
            type="info"
            message={
              isApproved
                ? 'This advancement has been applied. Use Revert on the Advancements page if you need to undo it.'
                : isPending
                  ? `A Director list (${data.submission!.topN} applicants) is pending. Your selection here replaces it when you apply advancement.`
                  : 'Record verbal Director decisions on a call: set your color ratings, pick who advances, then apply. Works before or instead of a Director submission. Applicant # matches what Directors use when they send a number list.'
            }
          />

          {isReadOnly && (
            <StatusBanner
              type="info"
              message={`${resolvedTeamName ?? 'This team'} has moved past ${fromStage.replace('_', ' ')}. This workspace is read-only.`}
            />
          )}

          {canAct && advancementCap === null && !allowUncappedFirstRound && (
            <StatusBanner
              type="warning"
              message="Set an advancement cap before you can apply a list."
              actionLabel="Cap settings"
              actionHref="/admin/advancements#advancement-caps"
            />
          )}

          {canAct && (
            <AdvancementRatingGuide
              intro={`${advancementRequiredStepIntro(true)} Your ratings are admin-only and do not replace panel ratings.`}
              steps={advancementStepGuide(true)}
            />
          )}

          {data.preview.incompleteCount > 0 && canAct && (
            <StatusBanner
              type="warning"
              message={`${advancementIncompleteReminder(
                data.preview.incompleteCount,
                data.preview.incompleteCount === 1
                  ? fromStage === 'application'
                    ? 'application'
                    : 'interview'
                  : fromStage === 'application'
                    ? 'applications'
                    : 'interviews',
              )} You can still apply advancement anyway.`}
            />
          )}

          {canSubmitAdvancement && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium">Advance list</p>
              <CardDescription>
                {minAdvanceCount === maxAdvanceCount
                  ? `Select exactly ${minAdvanceCount} to advance`
                  : `Select at least ${minAdvanceCount} (up to ${maxAdvanceCount})`}
                {overCapExtra > 0 && advancementCap !== null
                  ? `, over the usual limit of ${advancementCap} (+${overCapExtra} extra)`
                  : ''}
                .
              </CardDescription>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  className="h-auto px-0 text-sm font-normal underline-offset-4 hover:underline"
                  onClick={() => selectTopToAdvance(targetAdvanceCount)}
                >
                  Select top {targetAdvanceCount} by score
                </LoadingButton>
                <LoadingButton
                  variant="secondary"
                  size="sm"
                  className="h-auto px-0 text-sm font-normal underline-offset-4 hover:underline"
                  onClick={clearFinalAdvance}
                >
                  Clear list
                </LoadingButton>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium tabular-nums text-green-700 dark:text-green-400">
                    {finalCount}
                  </span>
                  {minAdvanceCount === maxAdvanceCount
                    ? ` of ${minAdvanceCount} selected`
                    : finalCount >= minAdvanceCount
                      ? ` selected (need at least ${minAdvanceCount})`
                      : ` of ${minAdvanceCount}+ selected`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <LoadingButton
                    loading={submitting}
                    disabled={!submitSelectionReady}
                    onClick={() => handleApply(true)}
                  >
                    Apply advancement now
                  </LoadingButton>
                  <LoadingButton
                    variant="secondary"
                    loading={submitting}
                    disabled={!submitSelectionReady}
                    onClick={() => handleApply(false)}
                  >
                    Save list only
                  </LoadingButton>
                </div>
              </div>
              {submitError && <p className="text-sm text-destructive">{submitError}</p>}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border/40">
            <Table className="w-full table-fixed border-separate border-spacing-0 [&_td]:py-2.5 [&_th]:pb-4">
              <AdvancementRankColGroup
                decision={canAct && !isApproved}
                advance={canSubmitAdvancement}
                view
              />
              <TableHeader>
                <TableRow>
                  {canAct && !isApproved && (
                    <TableHead className="px-3">Your rating</TableHead>
                  )}
                  <TableHead className="px-3">Rank</TableHead>
                  <TableHead className="px-3">Applicant</TableHead>
                  <TableHead className="px-3">Application</TableHead>
                  <AvgScoreHeader
                    className="px-3"
                    variant={fromStage === 'first_round' ? 'interview' : 'application'}
                  />
                  <TableHead className="px-3">Panel</TableHead>
                  {canSubmitAdvancement && (
                    <TableHead className="px-3">Advance</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((app) => {
                  const verdict = displayVerdict(app.applicationId);
                  const advanced = usesFinalSelection && finalSelection.has(app.applicationId);
                  const expanded = expandedIds.has(app.applicationId);
                  const numberLabel = `#${displayApplicantId(app.rowIndex)}`;
                  const fullLabel = `${applicantDisplayId(app.rowIndex)} · ${app.candidateName}`;
                  return (
                    <Fragment key={app.applicationId}>
                      <TableRow
                        className={cn(
                          verdictRowClass(verdict),
                          advanced && 'bg-green-50/70 dark:bg-green-950/25',
                        )}
                      >
                        {canAct && !isApproved && (
                          <TableCell className="relative px-3">
                            <VerdictAccentBar
                              verdict={verdict}
                              colorOverride={
                                advanced ? VERDICT_ACCENT_HEX.green : null
                              }
                            />
                            <AdvancementVerdictSelector
                              value={verdicts[app.applicationId] ?? app.adminVerdict ?? null}
                              onChange={(next) => void setVerdict(app.applicationId, next)}
                              applicantLabel={fullLabel}
                            />
                          </TableCell>
                        )}
                        <TableCell className="px-3 tabular-nums">{app.rank}</TableCell>
                        <TableCell className="min-w-0 px-3">
                          <p className="font-mono text-xs tabular-nums text-muted-foreground">
                            {numberLabel}
                          </p>
                          <p className="truncate font-medium">{app.candidateName}</p>
                        </TableCell>
                        <TableCell className="px-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={expanded}
                            aria-label={
                              expanded
                                ? `Hide application for ${fullLabel}`
                                : `View application for ${fullLabel}`
                            }
                            onClick={() => toggleExpanded(app.applicationId)}
                          >
                            {expanded ? 'Hide' : 'View'}
                          </Button>
                        </TableCell>
                        <TableCell className="px-3 text-left">
                          <AvgScoreCell
                            average={app.average}
                            rawAverage={fromStage === 'first_round' ? undefined : app.rawAverage}
                          />
                        </TableCell>
                        <TableCell className="px-3 whitespace-normal">
                          <PanelVerdictSummary
                            panelVerdicts={app.panelVerdicts}
                            myVerdict={verdicts[app.applicationId] ?? app.adminVerdict ?? null}
                          />
                        </TableCell>
                        {canSubmitAdvancement && (
                          <TableCell className="px-3">
                            <FinalAdvanceToggle
                              selected={finalSelection.has(app.applicationId)}
                              atCap={
                                !finalSelection.has(app.applicationId) &&
                                maxAdvanceCount > 0 &&
                                finalSelection.size >= maxAdvanceCount
                              }
                              label={fullLabel}
                              onToggle={() =>
                                toggleFinalAdvance(
                                  app.applicationId,
                                  !finalSelection.has(app.applicationId),
                                )
                              }
                            />
                          </TableCell>
                        )}
                      </TableRow>
                      {expanded && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={detailColSpan} className="bg-muted/20 px-3 py-3">
                            <AdminApplicationExpand
                              teamId={teamId}
                              applicationId={app.applicationId}
                              rowIndex={app.rowIndex}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {isApproved && (
            <p className="text-sm text-muted-foreground">
              View full submission log on{' '}
              <Link href="/admin/advancements" className="text-primary hover:underline">
                Advancements
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {data.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Submission log</CardTitle>
          </CardHeader>
          <CardContent>
            <AdvancementActivityLog entries={data.history} hideHeader />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
