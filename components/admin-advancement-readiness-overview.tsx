'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import StageBadge from '@/components/stage-badge';
import LoadingButton from '@/components/loading-button';
import { DestructiveConfirmDialog } from '@/components/destructive-confirm-dialog';
import { advancementFromStageLabel } from '@/lib/advancement-submissions-types';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import type { AdvancementOutcomeLabel } from '@/lib/advancement-admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AvgScoreHeader } from '@/components/avg-score-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { teamDotClass, teamLinkClass } from '@/lib/team-colors';

interface TeamReadinessRow {
  teamId: number;
  teamName: string;
  fromStage: AdvancementFromStage;
  status: {
    graders: Array<{
      userId: number;
      name: string;
      total: number;
      verdictSet: number;
      pending: number;
    }>;
    summary: {
      totalAssignments: number;
      scoringCompleted: number;
      verdictSet: number;
      applicationsInStage: number;
      totalApplicants: number;
    };
    allVerdictsComplete: boolean;
    submission: {
      status: 'none' | 'submitted' | 'approved' | 'withdrawn';
      submittedBy: string | null;
      topN: number | null;
    };
  };
  outcome: {
    rows: Array<{
      applicationId: number;
      rowIndex: number;
      candidateName: string;
      stage: string;
      outcome: AdvancementOutcomeLabel;
      average: number | null;
      rank: number | null;
    }>;
    advancedCount: number;
    rejectedCount: number;
    onListCount: number;
    pendingCount: number;
    canRevert: boolean;
    revertBlockedReason: string | null;
  };
}

function submissionLabel(status: TeamReadinessRow['status']['submission']['status']): string {
  switch (status) {
    case 'submitted':
      return 'Pending review';
    case 'approved':
      return 'Approved';
    case 'withdrawn':
      return 'Withdrawn';
    default:
      return 'Not submitted';
  }
}

function submissionColor(
  status: TeamReadinessRow['status']['submission']['status'],
): 'green' | 'yellow' | 'gray' | 'orange' {
  switch (status) {
    case 'submitted':
      return 'yellow';
    case 'approved':
      return 'green';
    case 'withdrawn':
      return 'gray';
    default:
      return 'gray';
  }
}

function outcomeBadge(outcome: AdvancementOutcomeLabel) {
  switch (outcome) {
    case 'advanced':
      return <StageBadge label="Advancing" color="green" />;
    case 'on_list':
      return <StageBadge label="On submitted list" color="yellow" />;
    case 'rejected':
      return <StageBadge label="Rejected" color="gray" />;
    default:
      return <StageBadge label="Still in round" color="orange" />;
  }
}

function TeamOutcomePanel({
  team,
  fromStage,
  onReverted,
}: {
  team: TeamReadinessRow;
  fromStage: AdvancementFromStage;
  onReverted: () => Promise<void>;
}) {
  const [reverting, setReverting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const advancedLabel =
    fromStage === 'application' ? 'First Round Interview' : 'Final Round Interview';

  const handleRevert = async () => {
    setReverting(true);
    try {
      const res = await fetch(`/api/admin/teams/${team.teamId}/advancement/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStage }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? 'Revert failed.');
        return;
      }
      toast.success(`Moved ${json.revertedCount} applicant(s) back to ${advancementFromStageLabel(fromStage)}.`);
      setConfirmOpen(false);
      await onReverted();
    } catch {
      toast.error('Revert failed.');
    } finally {
      setReverting(false);
    }
  };

  if (team.outcome.rows.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-muted-foreground">No applicants imported for this team.</p>
    );
  }

  return (
    <div className="space-y-4 bg-muted/20 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {team.outcome.onListCount > 0 ? (
            <>
              {team.outcome.onListCount} on the submitted list awaiting approval,{' '}
              {team.outcome.pendingCount} not selected
              {team.outcome.rejectedCount > 0
                ? `, ${team.outcome.rejectedCount} rejected`
                : ''}
              .
            </>
          ) : (
            <>
              {team.outcome.advancedCount} advancing to {advancedLabel},{' '}
              {team.outcome.rejectedCount} rejected, {team.outcome.pendingCount} still in{' '}
              {advancementFromStageLabel(fromStage).toLowerCase()}.
            </>
          )}
        </p>
        {team.outcome.canRevert ? (
          <LoadingButton
            variant="secondary"
            size="sm"
            loading={reverting}
            onClick={() => setConfirmOpen(true)}
          >
            Revert advancement
          </LoadingButton>
        ) : team.outcome.revertBlockedReason ? (
          <p className="text-sm text-muted-foreground">{team.outcome.revertBlockedReason}</p>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg bg-muted/30">
          <Table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '40%' }} />
              <col style={{ width: '30%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/50 hover:bg-muted/50">
                <TableHead>#</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Outcome</TableHead>
                <AvgScoreHeader
                  align="right"
                  variant={fromStage === 'first_round' ? 'interview' : 'application'}
                />
              </TableRow>
            </TableHeader>
          <TableBody>
            {team.outcome.rows.map((row) => (
              <TableRow key={row.applicationId} className="border-0">
                <TableCell className="tabular-nums text-muted-foreground">{row.rowIndex}</TableCell>
                <TableCell className="font-medium">{row.candidateName}</TableCell>
                <TableCell>{outcomeBadge(row.outcome)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.average !== null ? row.average.toFixed(2) : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DestructiveConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Revert Team Advancement?"
        description={
          <>
            Move {team.outcome.advancedCount + team.outcome.rejectedCount} applicant(s) back to{' '}
            {advancementFromStageLabel(fromStage)}. Scores stay saved, but ranks are cleared and
            grading unlocks again.
          </>
        }
        confirmLabel="Revert Advancement"
        onConfirm={handleRevert}
      />
    </div>
  );
}

export function AdminAdvancementReadinessOverview({
  teams,
  fromStage,
  onRefresh,
}: {
  teams: TeamReadinessRow[];
  fromStage: AdvancementFromStage;
  onRefresh?: () => Promise<void>;
}) {
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<number>>(new Set());

  if (teams.length === 0) return null;

  const toggleTeam = (teamId: number) => {
    setExpandedTeamIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Submission Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg bg-surface-panel">
          <Table className="w-full table-fixed">
            {/*
              Balanced proportional columns across the full card — no flexible
              last column that leaves a dead zone beside Director list.
              Parts ≈ team 1.2 / scoring 1 / recommendations 1.2 / exec 1.2 / director 1
            */}
            <colgroup>
              <col style={{ width: '3%' }} />
              <col style={{ width: '19%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '18%' }} />
            </colgroup>
            <TableHeader>
              <TableRow className="border-border/50 bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-10 px-2" />
                <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                  Team
                </TableHead>
                <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                  Scoring
                </TableHead>
                <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                  Recommendations
                </TableHead>
                <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                  Recommendors
                </TableHead>
                <TableHead className="text-xs font-medium tracking-wide text-muted-foreground">
                  Director list
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => {
                const summary = team.status.summary;
                const pendingGraders = team.status.graders.filter((g) => g.pending > 0);
                const totalGraders = team.status.graders.length;
                const execsDone = totalGraders - pendingGraders.length;
                const expanded = expandedTeamIds.has(team.teamId);

                return (
                  <Fragment key={team.teamId}>
                    <TableRow className="border-0">
                      <TableCell className="w-10 px-2">
                        <button
                          type="button"
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground uma-hover-on-nested hover:text-foreground"
                          aria-expanded={expanded}
                          aria-label={expanded ? 'Hide applicants' : 'Show applicants'}
                          onClick={() => toggleTeam(team.teamId)}
                        >
                          {expanded ? (
                            <ChevronDownIcon className="size-4" />
                          ) : (
                            <ChevronRightIcon className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/teams/${team.teamId}`}
                          className={cn(
                            'inline-flex items-center gap-2 font-medium hover:underline',
                            teamLinkClass(team.teamName),
                          )}
                        >
                          <span
                            className={cn(
                              'size-2 shrink-0 rounded-full',
                              teamDotClass(team.teamName),
                            )}
                            aria-hidden
                          />
                          {team.teamName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            summary.totalAssignments > 0 &&
                              summary.scoringCompleted === summary.totalAssignments
                              ? 'text-emerald-700'
                              : 'text-foreground',
                          )}
                        >
                          {summary.totalAssignments === 0
                            ? 'No assignments'
                            : `${summary.scoringCompleted}/${summary.totalAssignments} scored`}
                        </span>
                      </TableCell>
                      <TableCell>
                        {summary.totalAssignments === 0 ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <span
                            className={cn(
                              'text-sm tabular-nums',
                              team.status.allVerdictsComplete
                                ? 'text-emerald-700'
                                : 'text-foreground',
                            )}
                          >
                            {summary.verdictSet}/{summary.totalAssignments} set
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {totalGraders === 0 ? (
                          <span className="text-sm text-muted-foreground">-</span>
                        ) : (
                          <span
                            className={cn(
                              'text-sm tabular-nums',
                              pendingGraders.length === 0
                                ? 'text-emerald-700'
                                : 'text-foreground',
                            )}
                          >
                            {execsDone}/{totalGraders} done
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StageBadge
                          label={submissionLabel(team.status.submission.status)}
                          color={submissionColor(team.status.submission.status)}
                        />
                      </TableCell>
                    </TableRow>
                    {expanded && (
                      <TableRow className="border-0 hover:bg-transparent">
                        <TableCell colSpan={6} className="p-0">
                          <TeamOutcomePanel
                            team={team}
                            fromStage={fromStage}
                            onReverted={onRefresh ?? (async () => {})}
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
      </CardContent>
    </Card>
  );
}
