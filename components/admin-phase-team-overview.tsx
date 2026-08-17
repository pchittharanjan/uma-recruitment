'use client';

import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import StageBadge from '@/components/stage-badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RoundStatus } from '@/lib/db';
import type { TeamInterviewRoundStats } from '@/lib/interview-slots';
import { openTeamDeliberationsHref } from '@/lib/deliberations-workspace';
import { phaseLabel } from '@/lib/stages';
import { cn } from '@/lib/utils';

interface TeamRound {
  id: number;
  label: string;
  status: RoundStatus;
}

export interface PhaseTeamSummary {
  id: number;
  name: string;
  round: TeamRound | null;
  applicationCount: number;
  assignmentProgress: { total: number; completed: number };
  interviewStatsByStage: {
    first_round: TeamInterviewRoundStats | null;
    final_round: TeamInterviewRoundStats | null;
  };
}

function teamAccentClass(name: string): string {
  switch (name) {
    case 'Strategy':
      return 'bg-blue-500';
    case 'Events':
      return 'bg-amber-500';
    case 'Design':
      return 'bg-violet-500';
    default:
      return 'bg-muted-foreground';
  }
}

function interviewStatsForPhase(
  team: PhaseTeamSummary,
  viewPhase: RoundStatus,
): TeamInterviewRoundStats | null {
  if (viewPhase === 'first_round') return team.interviewStatsByStage.first_round;
  if (viewPhase === 'final_round') return team.interviewStatsByStage.final_round;
  return null;
}

function ProgressCell({
  total,
  completed,
  emptyLabel,
  doneLabel,
}: {
  total: number;
  completed: number;
  emptyLabel: string;
  doneLabel: string;
}) {
  const pending = total - completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const done = total > 0 && pending === 0;

  return (
    <div className="flex min-w-[10rem] max-w-xs flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            done ? 'text-emerald-700' : 'text-foreground',
          )}
        >
          {total === 0 ? emptyLabel : done ? doneLabel : `${completed} of ${total}`}
        </span>
        {total > 0 && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {completed}/{total}
          </span>
        )}
      </div>
      {total > 0 && (
        <Progress
          value={pct}
          max={100}
          className={cn(
            'w-full gap-0 [&_[data-slot=progress-track]]:h-1.5',
            done && '[&_[data-slot=progress-indicator]]:bg-emerald-600',
          )}
        />
      )}
    </div>
  );
}

function TeamNameCell({
  team,
  viewPhase,
  stats,
}: {
  team: PhaseTeamSummary;
  viewPhase: RoundStatus;
  stats: TeamInterviewRoundStats | null;
}) {
  const hasRound = team.round !== null;
  const isInterviewView = viewPhase === 'first_round' || viewPhase === 'final_round';

  return (
    <TableCell className="px-4 py-4 whitespace-normal">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full ring-2 ring-background',
            teamAccentClass(team.name),
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{team.name}</p>
          {hasRound && isInterviewView && stats && stats.candidateCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {stats.candidateCount} in {phaseLabel(viewPhase).toLowerCase()}
            </p>
          )}
          {hasRound && viewPhase === 'application' && team.applicationCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {team.applicationCount} applicant{team.applicationCount === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>
    </TableCell>
  );
}

function overviewTitle(status: RoundStatus): string {
  switch (status) {
    case 'pre_application':
      return 'Teams';
    case 'application':
      return 'Application grading';
    case 'first_round':
      return 'First Round Interview';
    case 'final_round':
      return 'Final Round Interview';
    case 'deliberations':
      return 'Team deliberations';
    case 'closed':
      return 'Recruitment closed';
    default:
      return 'Teams';
  }
}

export function AdminPhaseTeamOverview({
  viewPhase,
  teams,
}: {
  viewPhase: RoundStatus;
  teams: PhaseTeamSummary[];
}) {
  if (viewPhase === 'pre_application') {
    return null;
  }

  const title = overviewTitle(viewPhase);
  const isInterviewView = viewPhase === 'first_round' || viewPhase === 'final_round';

  if (viewPhase === 'closed') {
    return (
      <div className="space-y-1">
        <p className="uma-section-label">Team overview</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Cycle closed — teams are view-only. Browse phases in the sidebar; edits and outcome emails
          still work. Open Final selection for offers.
        </p>
      </div>
    );
  }

  return (
    <div id="interview-overview" className="scroll-mt-6 space-y-4">
      <div className="space-y-1">
        <p className="uma-section-label">Team overview</p>
        <h2 className="font-heading text-lg font-medium tracking-tight text-foreground">
          {title}
        </h2>
      </div>

      <div className="overflow-hidden rounded-xl bg-muted/35">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 bg-muted/25 hover:bg-muted/25">
              <TableHead className="h-11 px-4 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                Team
              </TableHead>
              {viewPhase === 'application' && (
                <TableHead className="h-11 px-4 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  Grading
                </TableHead>
              )}
              {isInterviewView && (
                <>
                  <TableHead className="h-11 px-4 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Scheduled
                  </TableHead>
                  <TableHead className="h-11 px-4 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    Interviews scored
                  </TableHead>
                </>
              )}
              {viewPhase === 'deliberations' && (
                <TableHead className="h-11 px-4 text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                  Status
                </TableHead>
              )}
              <TableHead className="h-11 px-4 text-right text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                {' '}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team) => {
              const hasRound = team.round !== null;
              const stats = interviewStatsForPhase(team, viewPhase);
              const { total, completed } = team.assignmentProgress;

              return (
                <TableRow
                  key={team.id}
                  className="border-border/40 transition-colors last:border-0 hover:bg-muted/35"
                >
                  <TeamNameCell team={team} viewPhase={viewPhase} stats={stats} />

                  {viewPhase === 'application' && (
                    <TableCell className="px-4 py-4 whitespace-normal">
                      {!hasRound ? (
                        <span className="text-sm text-muted-foreground">Import CSV to Start</span>
                      ) : (
                        <ProgressCell
                          total={total}
                          completed={completed}
                          emptyLabel="No assignments"
                          doneLabel="All graded"
                        />
                      )}
                    </TableCell>
                  )}

                  {isInterviewView && (
                    <>
                      <TableCell className="px-4 py-4 tabular-nums text-sm">
                        {!hasRound || !stats ? (
                          '—'
                        ) : stats.candidateCount === 0 ? (
                          <span className="text-muted-foreground">No applicants</span>
                        ) : stats.slotCount === 0 ? (
                          <span className="text-amber-800">
                            0/{stats.candidateCount} scheduled
                          </span>
                        ) : (
                          `${stats.slotCount}/${stats.candidateCount} scheduled`
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 whitespace-normal">
                        {!hasRound || !stats ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : (
                          <ProgressCell
                            total={stats.scoring.total}
                            completed={stats.scoring.completed}
                            emptyLabel="No interview assignments"
                            doneLabel="All interviews scored"
                          />
                        )}
                      </TableCell>
                    </>
                  )}

                  {viewPhase === 'deliberations' && (
                    <TableCell className="px-4 py-4">
                      {hasRound ? (
                        <StageBadge label="Active" color="orange" />
                      ) : (
                        <StageBadge label="No round" color="gray" />
                      )}
                    </TableCell>
                  )}

                  <TableCell className="px-4 py-4 text-right">
                      {isInterviewView ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          nativeButton={false}
                          render={
                            <Link
                              href={
                                viewPhase === 'final_round'
                                  ? `/admin/teams/${team.id}/schedule/final-round`
                                  : `/admin/teams/${team.id}/schedule/first-round`
                              }
                            />
                          }
                        >
                          Schedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          nativeButton={false}
                          render={<Link href={`/admin/teams/${team.id}`} />}
                        >
                          Open team
                          <ArrowRightIcon
                            data-icon="inline-end"
                            className="transition-transform group-hover/button:translate-x-0.5"
                          />
                        </Button>
                      </div>
                      ) : viewPhase === 'deliberations' && hasRound ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          nativeButton={false}
                          render={
                            <Link href={openTeamDeliberationsHref(team.id)} />
                          }
                        >
                          Open deliberations
                          <ArrowRightIcon
                            data-icon="inline-end"
                            className="transition-transform group-hover/button:translate-x-0.5"
                          />
                        </Button>
                      ) : hasRound ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          nativeButton={false}
                          render={<Link href={`/admin/teams/${team.id}`} />}
                        >
                          Open team
                          <ArrowRightIcon
                            data-icon="inline-end"
                            className="transition-transform group-hover/button:translate-x-0.5"
                          />
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">Waiting for global import</span>
                      )}
                    </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
