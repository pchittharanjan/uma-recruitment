'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import StageBadge from '@/components/stage-badge';
import { cn } from '@/lib/utils';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import { RecruitmentPhaseChecklist } from '@/components/recruitment-phase-checklist';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoundStatus } from '@/lib/db';
import type { PhaseChecklistStep } from '@/lib/phase-checklist';
import { dispatchPipelinePhaseChanged, PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import { PIPELINE_PHASES, phaseLabel, type UnlockableStage } from '@/lib/stages';
import {
  phaseLabelForTeam,
  pipelinePhasesForTeam,
  nextPipelineStatusForTeam,
} from '@/lib/team-pipeline-profile';
import {
  teamCardHoverClass,
  teamCheckboxAccentClass,
  teamLinkClass,
  teamStageBadgeClass,
} from '@/lib/team-colors';

interface TeamPipelineCard {
  teamId: number;
  teamName: string;
  round: { id: number; status: RoundStatus } | null;
  unlockedStages: UnlockableStage[];
}

interface GlobalPhaseState {
  status: RoundStatus | null;
  nextStatus: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  teams: TeamPipelineCard[];
  checklist?: PhaseChecklistStep[];
}

export function GlobalPhaseControls({
  viewingStatus,
  onViewingStatusChange,
  onPhaseChange,
}: {
  viewingStatus: RoundStatus | null;
  onViewingStatusChange: (status: RoundStatus) => void;
  onPhaseChange?: () => void;
}) {
  const [state, setState] = useState<GlobalPhaseState | null>(null);
  const [viewingChecklist, setViewingChecklist] = useState<PhaseChecklistStep[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notices, setNotices] = useState<string[]>([]);

  const loadChecklistFor = useCallback(async (status: RoundStatus, current?: GlobalPhaseState) => {
    const snapshot = current ?? state;
    if (!snapshot) return;
    const isGlobalChecklist =
      status === snapshot.status || (!snapshot.status && status === 'pre_application');
    if (isGlobalChecklist && snapshot.checklist) {
      setViewingChecklist(snapshot.checklist);
      return;
    }
    setChecklistLoading(true);
    try {
      const res = await fetch(`/api/admin/phase?checklistStatus=${status}`);
      const json = await res.json();
      if (res.ok) {
        setViewingChecklist(json.checklist ?? []);
      }
    } finally {
      setChecklistLoading(false);
    }
  }, [state]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/phase');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load phases.');
        return;
      }
      const nextState: GlobalPhaseState = {
        status: json.status,
        nextStatus: json.nextStatus,
        unlockedStages: json.unlockedStages ?? [],
        teams: (json.teams ?? []).map((t: TeamPipelineCard) => ({
          teamId: t.teamId,
          teamName: t.teamName,
          round: t.round ? { id: t.round.id, status: t.round.status } : null,
          unlockedStages: t.unlockedStages ?? [],
        })),
        checklist: json.checklist ?? [],
      };
      setState(nextState);
      setError('');
    } catch {
      setError('Failed to load phases.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChange = () => load();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [load]);

  useEffect(() => {
    if (!state) return;
    const statusForView = viewingStatus ?? state.status ?? 'pre_application';
    void loadChecklistFor(statusForView, state);
  }, [viewingStatus, state, loadChecklistFor]);

  const selectPhaseChecklist = async (status: RoundStatus) => {
    onViewingStatusChange(status);
    await loadChecklistFor(status);
  };

  const postTeamAction = async (
    teamId: number,
    body: { action: string; stage?: UnlockableStage },
  ) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/phase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const message = json.error ?? 'Action failed.';
        setError(message);
        toast.error(message);
        return;
      }
      if (json.warnings?.length) {
        setNotices(json.warnings);
      }
      await load();
      dispatchPipelinePhaseChanged();
      onPhaseChange?.();
      if (body.action === 'advance') {
        toast.success(`Advanced ${json.teamName} to ${phaseLabel(json.status)}`);
      } else if (body.action === 'unlock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} reopened for ${json.teamName}`);
      } else if (body.action === 'lock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} locked for ${json.teamName}`);
      }
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card role="status" aria-label="Loading">
        <CardHeader className="border-b border-border">
          <div className="min-w-0 space-y-1">
            <CardTitle>Team Phases</CardTitle>
            <Skeleton className="h-4 w-48" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-7 w-full" />
          <div className="space-y-2 border-t border-border pt-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!state) {
    return null;
  }

  const fallbackStatus: RoundStatus = 'pre_application';
  const activeView = viewingStatus ?? state.status ?? fallbackStatus;
  const allTeamsClosed =
    state.teams.length > 0 && state.teams.every((t) => t.round?.status === 'closed');
  const showGlobalImportAction = activeView === 'application';

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="scroll-mt-24 border-b border-border" id="pipeline-controls">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle>Team Phases</CardTitle>
            {state.teams.length > 0 && (
              <CardDescription className="text-pretty">
                {!state.status
                  ? 'No team recruiting cycles yet. Set coffee chat dates to start, then advance each team individually below.'
                  : 'Click to unlock each phase.'}
              </CardDescription>
            )}
          </div>
          {allTeamsClosed && (
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <p className="text-sm text-muted-foreground">
                Team members are view-only; you can still send outcome emails and make admin
                changes.
              </p>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/final-selection" />}
              >
                View final selection
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {state.teams.length > 0 && (
          <section>
            <div className="@container min-w-0">
              <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @3xl:grid-cols-3">
                {state.teams.map((team) => {
                const phases = pipelinePhasesForTeam(team.teamName).filter((p) => p.unlockKey);
                const teamStatus = team.round?.status ?? null;
                const teamNext = teamStatus
                  ? nextPipelineStatusForTeam(teamStatus, team.teamName)
                  : null;
                return (
                  <div
                    key={team.teamId}
                    className="min-w-0 space-y-3 rounded-lg border border-border/70 uma-nested-surface p-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <p className="min-w-0 font-medium">{team.teamName}</p>
                      {teamStatus ? (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-medium',
                            teamStageBadgeClass(team.teamName),
                          )}
                        >
                          {phaseLabelForTeam(teamStatus, team.teamName)}
                        </span>
                      ) : (
                        <StageBadge label="No round" color="gray" size="compact" />
                      )}
                    </div>
                    {team.round && teamNext && teamStatus !== 'closed' && (
                      <Button
                        variant="link"
                        size="sm"
                        disabled={busy}
                        className={cn(
                          'h-auto w-full justify-start whitespace-normal px-0 text-left font-medium text-pretty disabled:text-muted-foreground disabled:no-underline disabled:opacity-60',
                          teamLinkClass(team.teamName),
                        )}
                        onClick={() => postTeamAction(team.teamId, { action: 'advance' })}
                      >
                        {teamNext === 'closed'
                          ? `Close ${team.teamName} cycle →`
                          : `Advance to ${phaseLabelForTeam(teamNext, team.teamName)} →`}
                      </Button>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {phases.map((phase) => {
                        const key = phase.unlockKey!;
                        const open = team.unlockedStages.includes(key);
                        const toggleDisabled =
                          busy || !team.round || teamStatus === 'closed';
                        return (
                          <label
                            key={key}
                            htmlFor={`team-${team.teamId}-unlock-${key}`}
                            className={cn(
                              'flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-none transition-colors',
                              toggleDisabled
                                ? 'cursor-not-allowed opacity-60'
                                : cn('cursor-pointer uma-hover-on-nested', teamCardHoverClass(team.teamName)),
                            )}
                          >
                            <Checkbox
                              id={`team-${team.teamId}-unlock-${key}`}
                              checked={open}
                              disabled={toggleDisabled}
                              checkedClassName={teamCheckboxAccentClass(team.teamName)}
                              className="size-3.5"
                              onCheckedChange={(checked) =>
                                postTeamAction(team.teamId, {
                                  action: checked === true ? 'unlock' : 'lock',
                                  stage: key,
                                })
                              }
                            />
                            {phaseLabelForTeam(phase.status, team.teamName)}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </section>
        )}

        <section className="border-t border-border pt-4">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="uma-section-label shrink-0">Browse phase checklists</p>
            <RecruitmentPhaseStepper
              currentStatus={activeView}
              selectedStatus={activeView}
              mode="browse"
              compact
              className="min-w-0 flex-1"
              onSelectPhase={selectPhaseChecklist}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Click a phase to preview its setup checklist. Manage live phases per team above.
          </p>
        </section>

        {checklistLoading ? (
          <div className="space-y-2 border-t border-border pt-4" role="status" aria-label="Loading">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          viewingChecklist.length > 0 && (
            <section className="border-t border-border pt-4">
              <RecruitmentPhaseChecklist
                title={`${phaseLabel(activeView)} checklist`}
                steps={viewingChecklist}
              />
            </section>
          )
        )}

        {showGlobalImportAction && (
          <section className="border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              className="transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              nativeButton={false}
              render={<Link href="/admin/import" />}
            >
              Open import flow
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
          </section>
        )}

        {(notices.length > 0 || error) && (
          <section className="space-y-1 border-t border-border pt-4">
            {notices.map((notice) => (
              <p key={notice} className="text-sm text-muted-foreground">
                {notice}
              </p>
            ))}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
