'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, LockIcon } from 'lucide-react';
import { toast } from 'sonner';
import StageBadge from '@/components/stage-badge';
import { cn } from '@/lib/utils';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import { RecruitmentPhaseChecklist } from '@/components/recruitment-phase-checklist';
import { TeamPhaseScrubber } from '@/components/team-phase-scrubber';
import { TypedConfirmDialog } from '@/components/typed-confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoundStatus } from '@/lib/db';
import type { PhaseChecklistStep } from '@/lib/phase-checklist';
import { dispatchPipelinePhaseChanged, PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import {
  PIPELINE_PHASES,
  isRoundAtOrPastStatus,
  phaseLabel,
  statusIndex,
  type UnlockableStage,
} from '@/lib/stages';
import {
  phaseLabelForTeam,
  pipelinePhasesForTeam,
  nextPipelineStatusForTeam,
} from '@/lib/team-pipeline-profile';
import {
  teamCardHoverClass,
  teamCheckboxAccentClass,
  teamStageBadgeClass,
  teamUnlockChipClass,
} from '@/lib/team-colors';

interface TeamPhaseRevertInfo {
  canRevert: boolean;
  revertBlockedReason: string | null;
  previousStatus: RoundStatus | null;
  blockingApplicantCount: number;
}

interface TeamPipelineCard {
  teamId: number;
  teamName: string;
  round: { id: number; status: RoundStatus } | null;
  unlockedStages: UnlockableStage[];
  phaseRevert?: TeamPhaseRevertInfo;
}

interface GlobalPhaseState {
  status: RoundStatus | null;
  nextStatus: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  teams: TeamPipelineCard[];
  checklist?: PhaseChecklistStep[];
}

export type GlobalPhaseInitialState = GlobalPhaseState;

function mapPhasePayload(json: Record<string, unknown>): GlobalPhaseState {
  return {
    status: (json.status as RoundStatus | null) ?? null,
    nextStatus: (json.nextStatus as RoundStatus | null) ?? null,
    unlockedStages: (json.unlockedStages as UnlockableStage[]) ?? [],
    teams: ((json.teams ?? []) as TeamPipelineCard[]).map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      round: t.round ? { id: t.round.id, status: t.round.status } : null,
      unlockedStages: t.unlockedStages ?? [],
      phaseRevert: t.phaseRevert,
    })),
    checklist: (json.checklist as PhaseChecklistStep[]) ?? [],
  };
}

export function GlobalPhaseControls({
  viewingStatus,
  onViewingStatusChange,
  onPhaseChange,
  initialPhaseState,
}: {
  viewingStatus: RoundStatus | null;
  onViewingStatusChange: (status: RoundStatus) => void;
  onPhaseChange?: () => void;
  initialPhaseState?: GlobalPhaseInitialState;
}) {
  const [state, setState] = useState<GlobalPhaseState | null>(initialPhaseState ?? null);
  const [viewingChecklist, setViewingChecklist] = useState<PhaseChecklistStep[]>(
    () => initialPhaseState?.checklist ?? [],
  );
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [loading, setLoading] = useState(!initialPhaseState);
  const [busy, setBusy] = useState(false);
  const [advancingTeamId, setAdvancingTeamId] = useState<number | null>(null);
  const [revertingTeamId, setRevertingTeamId] = useState<number | null>(null);
  const [advanceConfirm, setAdvanceConfirm] = useState<{
    teamId: number;
    teamName: string;
    teamNext: RoundStatus;
  } | null>(null);
  const [revertConfirm, setRevertConfirm] = useState<{
    teamId: number;
    teamName: string;
    previousStatus: RoundStatus;
    currentStatus: RoundStatus;
    applicantsToRevert: number;
  } | null>(null);
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
    if (!state) setLoading(true);
    try {
      const res = await fetch('/api/admin/phase');
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to load phases.');
        return;
      }
      const nextState = mapPhasePayload(json);
      setState(nextState);
      setError('');
    } catch {
      setError('Failed to load phases.');
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => {
    if (initialPhaseState) return;
    void load();
  }, [load, initialPhaseState]);

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
  ): Promise<boolean> => {
    setBusy(true);
    if (body.action === 'advance') {
      setAdvancingTeamId(teamId);
    } else if (body.action === 'revert') {
      setRevertingTeamId(teamId);
    }
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
        return false;
      }
      if (json.warnings?.length) {
        setNotices(json.warnings);
      }
      await load();
      dispatchPipelinePhaseChanged();
      onPhaseChange?.();
      if (body.action === 'advance') {
        toast.success(`Advanced ${json.teamName} to ${phaseLabel(json.status)}`);
        if (json.warnings?.length) {
          for (const warning of json.warnings) {
            toast.message(warning);
          }
        }
      } else if (body.action === 'revert') {
        toast.success(
          `Moved ${json.teamName} back to ${phaseLabelForTeam(json.status, json.teamName)}`,
        );
        if (json.warnings?.length) {
          for (const warning of json.warnings) {
            toast.message(warning);
          }
        }
      } else if (body.action === 'unlock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} reopened for ${json.teamName}`);
      } else if (body.action === 'lock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} locked for ${json.teamName}`);
      }
      return true;
    } catch {
      setError('Network error.');
      toast.error('Network error.');
      return false;
    } finally {
      setBusy(false);
      setAdvancingTeamId(null);
      setRevertingTeamId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <p className="uma-section-label">Team Phases</p>
          <Skeleton className="h-4 w-48" />
        </div>
        <Card role="status" aria-label="Loading">
          <CardContent className="space-y-4">
            <Skeleton className="h-7 w-full" />
            <div className="space-y-2 border-t border-border pt-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
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
  const teamsInViewedPhase = state.teams.filter(
    (t) => t.round != null && isRoundAtOrPastStatus(t.round.status, activeView),
  ).length;
  const previewOnlyChecklist =
    state.teams.some((t) => t.round != null) &&
    teamsInViewedPhase === 0 &&
    activeView !== 'pre_application' &&
    activeView !== 'closed' &&
    activeView !== 'setup';

  return (
    <div className="scroll-mt-24 space-y-4" id="pipeline-controls">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="uma-section-label">Team Phases</p>
          {state.teams.length > 0 && (
            <>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {!state.status
                  ? 'Advance each team from Coffee Chats to Application when you are ready to import and grade.'
                  : 'Move each team forward, then unlock exec access when members should start working.'}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
                Advance = move official phase forward. Unlock = let execs start working.
              </p>
            </>
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

    <Card className="min-w-0 overflow-hidden">
      <CardContent className="space-y-4">
        {state.teams.length > 0 && (
          <section>
            <div className="@container min-w-0">
              <div className="grid grid-cols-1 gap-5 @lg:grid-cols-2 @3xl:grid-cols-3">
                {state.teams.map((team) => {
                const phases = pipelinePhasesForTeam(team.teamName).filter((p) => p.unlockKey);
                const teamStatus = team.round?.status ?? null;
                const teamNext = teamStatus
                  ? nextPipelineStatusForTeam(teamStatus, team.teamName)
                  : null;
                const currentIdx = teamStatus ? statusIndex(teamStatus) : -1;
                const isAdvancing = advancingTeamId === team.teamId;
                const isReverting = revertingTeamId === team.teamId;
                const phaseRevert = team.phaseRevert;
                return (
                  <div
                    key={team.teamId}
                    className="min-w-0 space-y-5 rounded-lg border border-border/70 uma-nested-surface px-5 pb-5 pt-5"
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2.5">
                      <p className="min-w-0 font-medium">{team.teamName}</p>
                      {teamStatus ? (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-lg px-3 py-1 text-sm font-medium',
                            teamStageBadgeClass(team.teamName),
                          )}
                        >
                          {phaseLabelForTeam(teamStatus, team.teamName)}
                        </span>
                      ) : (
                        <StageBadge label="No round" color="gray" size="compact" />
                      )}
                    </div>

                    {team.round && teamStatus ? (
                      <div className="space-y-4 border-t border-border/60 pt-5">
                        <div className="space-y-2">
                          <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                            Team&apos;s official phase
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Drag between stages (or use the arrows). Earlier phases close for
                            editing when you advance — you&apos;ll still type to confirm.
                          </p>
                        </div>
                        <TeamPhaseScrubber
                          teamName={team.teamName}
                          status={teamStatus}
                          nextStatus={teamNext}
                          canAdvance={Boolean(teamNext) && teamStatus !== 'closed'}
                          canRevert={Boolean(
                            phaseRevert?.canRevert && phaseRevert.previousStatus,
                          )}
                          previousStatus={phaseRevert?.previousStatus ?? null}
                          disabled={false}
                          busy={busy}
                          isAdvancing={isAdvancing}
                          isReverting={isReverting}
                          onRequestAdvance={() => {
                            if (!teamNext) return;
                            setAdvanceConfirm({
                              teamId: team.teamId,
                              teamName: team.teamName,
                              teamNext,
                            });
                          }}
                          onRequestRevert={() => {
                            if (!phaseRevert?.previousStatus) return;
                            setRevertConfirm({
                              teamId: team.teamId,
                              teamName: team.teamName,
                              previousStatus: phaseRevert.previousStatus,
                              currentStatus: teamStatus,
                              applicantsToRevert: phaseRevert.blockingApplicantCount,
                            });
                          }}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-3.5 border-t border-border/60 pt-5">
                      <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Unlock for Exec Access
                      </p>
                      <div className="flex flex-wrap gap-2.5">
                      {phases.map((phase) => {
                        const key = phase.unlockKey!;
                        const phaseIdx = statusIndex(phase.status);
                        const isFuture = teamStatus ? phaseIdx > currentIdx : true;
                        const open = team.unlockedStages.includes(key);
                        const phaseLabelText = phaseLabelForTeam(phase.status, team.teamName);
                        const toggleDisabled =
                          busy || !team.round || teamStatus === 'closed' || isFuture;

                        return (
                          <label
                            key={key}
                            htmlFor={
                              toggleDisabled ? undefined : `team-${team.teamId}-unlock-${key}`
                            }
                            title={
                              isFuture
                                ? 'Advance the team here first'
                                : open
                                  ? 'Exec access open — click to close'
                                  : 'Exec access closed — click to open'
                            }
                            className={cn(
                              'flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2.5 text-xs leading-none transition-colors',
                              teamUnlockChipClass(team.teamName, open, {
                                disabled: toggleDisabled,
                              }),
                              toggleDisabled
                                ? 'cursor-not-allowed'
                                : cn('cursor-pointer uma-hover-on-nested', teamCardHoverClass(team.teamName)),
                            )}
                          >
                            {isFuture ? (
                              <LockIcon
                                className="size-3.5 shrink-0 text-muted-foreground/70"
                                aria-hidden
                              />
                            ) : (
                              <Checkbox
                                id={`team-${team.teamId}-unlock-${key}`}
                                checked={open}
                                disabled={toggleDisabled}
                                checkedClassName={teamCheckboxAccentClass(team.teamName)}
                                className={cn(
                                  'size-3.5 bg-background',
                                  open
                                    ? 'border-transparent'
                                    : 'border-2 border-foreground/45',
                                )}
                                onCheckedChange={(checked) =>
                                  postTeamAction(team.teamId, {
                                    action: checked === true ? 'unlock' : 'lock',
                                    stage: key,
                                  })
                                }
                              />
                            )}
                            <span
                              className={cn(
                                open && !toggleDisabled && 'font-medium',
                                !open && !toggleDisabled && 'text-muted-foreground',
                              )}
                            >
                              {phaseLabelText}
                            </span>
                          </label>
                        );
                      })}
                      </div>
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
                previewOnly={previewOnlyChecklist}
                previewPhaseLabel={phaseLabel(activeView)}
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

      <TypedConfirmDialog
        open={advanceConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setAdvanceConfirm(null);
        }}
        title={
          advanceConfirm?.teamNext === 'closed'
            ? `Close ${advanceConfirm?.teamName ?? 'team'} cycle?`
            : `Move ${advanceConfirm?.teamName ?? 'team'} to ${
                advanceConfirm
                  ? phaseLabelForTeam(advanceConfirm.teamNext, advanceConfirm.teamName)
                  : 'the next phase'
              }?`
        }
        confirmationPhrase="advance"
        inputId="phase-advance-confirm"
        confirmLabel={
          advanceConfirm?.teamNext === 'closed'
            ? 'Close cycle'
            : `Advance to ${
                advanceConfirm
                  ? phaseLabelForTeam(advanceConfirm.teamNext, advanceConfirm.teamName)
                  : 'next phase'
              }`
        }
        onConfirm={async () => {
          if (!advanceConfirm) return;
          const ok = await postTeamAction(advanceConfirm.teamId, { action: 'advance' });
          if (!ok) throw new Error('Advance failed');
        }}
      />

      <TypedConfirmDialog
        open={revertConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setRevertConfirm(null);
        }}
        title={
          revertConfirm
            ? `Move ${revertConfirm.teamName} back to ${phaseLabelForTeam(revertConfirm.previousStatus, revertConfirm.teamName)}?`
            : 'Move team back?'
        }
        confirmationPhrase="revert"
        inputId="phase-revert-confirm"
        confirmVariant="danger"
        confirmLabel={
          revertConfirm
            ? `Move back to ${phaseLabelForTeam(revertConfirm.previousStatus, revertConfirm.teamName)}`
            : 'Move back'
        }
        onConfirm={async () => {
          if (!revertConfirm) return;
          const ok = await postTeamAction(revertConfirm.teamId, { action: 'revert' });
          if (!ok) throw new Error('Revert failed');
        }}
      />
    </div>
  );
}
