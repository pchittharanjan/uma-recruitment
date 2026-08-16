'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import LoadingButton from '@/components/loading-button';
import StageBadge from '@/components/stage-badge';
import { RecruitmentPhaseStepper } from '@/components/recruitment-phase-stepper';
import { RecruitmentPhaseChecklist } from '@/components/recruitment-phase-checklist';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import type { RoundStatus } from '@/lib/db';
import type { PhaseChecklistStep } from '@/lib/phase-checklist';
import { dispatchPipelinePhaseChanged, PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import { PIPELINE_PHASES, phaseLabel, type UnlockableStage } from '@/lib/stages';
import { cn } from '@/lib/utils';

interface GlobalPhaseState {
  status: RoundStatus | null;
  nextStatus: RoundStatus | null;
  unlockedStages: UnlockableStage[];
  teamsWithoutRound: Array<{ teamId: number; teamName: string }>;
  statusDrift: boolean;
  driftedTeams: Array<{ teamId: number; teamName: string; status: RoundStatus }>;
  unlockDrift: boolean;
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
        teamsWithoutRound: json.teamsWithoutRound ?? [],
        statusDrift: Boolean(json.statusDrift),
        driftedTeams: json.driftedTeams ?? [],
        unlockDrift: Boolean(json.unlockDrift),
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

  const postAction = async (body: { action: string; stage?: UnlockableStage }) => {
    setBusy(true);
    setError('');
    setNotices([]);
    try {
      const res = await fetch('/api/admin/phase', {
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
      const nextState: GlobalPhaseState = {
        status: json.status,
        nextStatus: json.nextStatus,
        unlockedStages: json.unlockedStages ?? [],
        teamsWithoutRound: json.teamsWithoutRound ?? [],
        statusDrift: Boolean(json.statusDrift),
        driftedTeams: json.driftedTeams ?? [],
        unlockDrift: Boolean(json.unlockDrift),
        checklist: json.checklist ?? [],
      };
      setState(nextState);
      if (json.status) {
        // Don't park the admin dashboard on the empty "Closed" overview.
        const browseStatus =
          json.status === 'closed' ? ('deliberations' as RoundStatus) : json.status;
        onViewingStatusChange(browseStatus);
        if (json.status === 'closed') {
          void loadChecklistFor(browseStatus, nextState);
        } else {
          setViewingChecklist(json.checklist ?? []);
        }
      }
      if (json.warnings?.length) {
        setNotices(json.warnings);
      }
      if (body.action === 'advance') {
        toast.success(`Advanced all teams to ${phaseLabel(json.status)}`);
      } else if (body.action === 'unlock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} reopened for grading`);
      } else if (body.action === 'lock' && body.stage) {
        const stageName =
          PIPELINE_PHASES.find((p) => p.unlockKey === body.stage)?.label ?? body.stage;
        toast.success(`${stageName} locked — graders can no longer edit`);
      }
      dispatchPipelinePhaseChanged();
      onPhaseChange?.();
    } catch {
      setError('Network error.');
      toast.error('Network error.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="display-panel space-y-5 p-5 sm:p-6" role="status" aria-label="Loading">
        <div>
          <p className="uma-section-label">Global status</p>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      </div>
    );
  }

  if (!state?.status) {
    const fallbackStatus: RoundStatus = 'pre_application';
    const activeView = viewingStatus ?? fallbackStatus;
    const hasChecklist = viewingChecklist.length > 0;
    return (
      <div className="display-panel space-y-5 p-5 sm:p-6">
        <div>
          <p className="uma-section-label">Global status</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StageBadge label="Not started" color="blue" />
            <p className="text-sm text-muted-foreground">
              No team recruiting cycles yet. Once a team starts a cycle, this will show the current
              phase (Coffee Chats → Application → Interviews → Deliberations).
            </p>
          </div>
        </div>

        <div>
          <p className="uma-section-label mb-3">Phase progression</p>
          <RecruitmentPhaseStepper
            currentStatus={fallbackStatus}
            selectedStatus={activeView}
            unlockedStages={[]}
            mode="admin"
            onSelectPhase={selectPhaseChecklist}
          />
        </div>

        {checklistLoading ? (
          <div className="space-y-2" role="status" aria-label="Loading">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
        ) : (
          hasChecklist && (
            <div>
              <RecruitmentPhaseChecklist
                title={`${phaseLabel(activeView)} checklist`}
                steps={viewingChecklist}
                preview={activeView !== fallbackStatus}
              />
            </div>
          )
        )}
      </div>
    );
  }

  const unlockablePhases = PIPELINE_PHASES.filter((p) => p.unlockKey);
  const activeView = viewingStatus ?? state.status;
  const showGlobalImportAction = activeView === 'application';

  return (
    <div className="display-panel space-y-5 p-5 sm:p-6">
      <div id="move-all-teams" className="scroll-mt-24">
        <p className="uma-section-label">Global status</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <StageBadge label={phaseLabel(state.status)} color="blue" />
            {state.statusDrift && (
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {`Most teams are here; ${state.driftedTeams.map((t) => t.teamName).join(', ')} ${state.driftedTeams.length === 1 ? 'is' : 'are'} behind.`}
              </p>
            )}
          </div>
          {state.nextStatus && state.status !== 'closed' && (
            <div className="flex min-w-[14rem] flex-col items-stretch gap-2 rounded-lg bg-gradient-to-br from-primary/[0.07] to-accent/[0.04] px-3.5 py-3 sm:items-end sm:text-right">
              <p className="text-sm font-medium text-foreground">
                {phaseLabel(state.nextStatus)}
              </p>
              <LoadingButton
                variant="primary"
                size="sm"
                className="uma-cta-primary"
                disabled={busy}
                onClick={() => postAction({ action: 'advance' })}
              >
                {state.nextStatus === 'closed'
                  ? 'Close recruitment cycle →'
                  : `Move All teams to ${phaseLabel(state.nextStatus)} →`}
              </LoadingButton>
            </div>
          )}
          {state.status === 'closed' && (
            <div className="flex flex-col items-stretch gap-2 sm:items-end sm:text-right">
              <p className="max-w-sm text-sm text-muted-foreground">
                Team members are view-only; you can still send outcome emails and make admin changes.
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
      </div>

      <div id="stage-access" className="scroll-mt-24">
        <p className="uma-section-label mb-3">Stage access (all teams)</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {unlockablePhases.map((phase) => {
            const key = phase.unlockKey!;
            const open = state.unlockedStages.includes(key);
            return (
              <div
                key={key}
                className={cn(
                  'flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors',
                  open
                    ? 'bg-primary/[0.07]'
                    : 'bg-muted/55',
                )}
              >
                <Label
                  htmlFor={`global-unlock-${key}`}
                  className="truncate text-sm font-normal"
                  title={open ? 'Open for Grading' : 'Locked'}
                >
                  {phase.label}
                  {!open && (
                    <span className="ml-1 text-muted-foreground">(locked)</span>
                  )}
                </Label>
                <input
                  id={`global-unlock-${key}`}
                  type="checkbox"
                  checked={open}
                  disabled={busy || state.status === 'closed'}
                  className="size-4 rounded accent-primary"
                  aria-label={`${open ? 'Lock' : 'Reopen'} ${phase.label}`}
                  onChange={(e) =>
                    postAction({ action: e.target.checked ? 'unlock' : 'lock', stage: key })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="uma-section-label mb-3">Phase progression</p>
        <RecruitmentPhaseStepper
          currentStatus={state.status}
          selectedStatus={activeView}
          unlockedStages={state.unlockedStages}
          mode="admin"
          onSelectPhase={selectPhaseChecklist}
        />
      </div>

      {checklistLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ) : (
        viewingChecklist.length > 0 && (
          <div>
            <RecruitmentPhaseChecklist
              title={`${phaseLabel(activeView)} checklist`}
              steps={viewingChecklist}
              preview={activeView !== state.status}
            />
          </div>
        )
      )}

      {showGlobalImportAction && (
        <div className="rounded-lg bg-muted/55 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
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
          </div>
        </div>
      )}

      {(state.statusDrift || state.unlockDrift || state.teamsWithoutRound.length > 0) && (
        <div className="space-y-1 rounded-lg bg-amber-500/[0.08] px-3 py-2.5 text-sm text-amber-950 dark:text-amber-200">
          {state.statusDrift && (
            <p>
              Phase drift:{' '}
              {state.driftedTeams.map((t) => `${t.teamName} (${phaseLabel(t.status)})`).join(', ')}.
              Use &ldquo;Move All teams&rdquo; above to sync everyone.
            </p>
          )}
          {state.unlockDrift && (
            <p>Stage locks differ between teams. Toggle a stage to sync all.</p>
          )}
          {state.teamsWithoutRound.length > 0 && (
            <p>
              No imported team cycle: {state.teamsWithoutRound.map((t) => t.teamName).join(', ')}.
            </p>
          )}
        </div>
      )}

      {notices.map((notice) => (
        <p key={notice} className="text-sm text-muted-foreground">
          {notice}
        </p>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
