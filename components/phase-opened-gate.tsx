'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  isAnnounceablePhase,
  PhaseOpenedDialog,
  wasPhaseOpenedDismissed,
} from '@/components/phase-opened-dialog';
import type { RoundStatus } from '@/lib/db';
import { PIPELINE_PHASE_CHANGED_EVENT } from '@/lib/pipeline-events';
import {
  statusIndex,
  teamPhaseHref,
  unlockKeyForStatus,
  type UnlockableStage,
} from '@/lib/stages';

interface NavTeam {
  id: number;
  name: string;
  round: { status: RoundStatus } | null;
  grantedStages: UnlockableStage[] | 'all';
  unlockedStages: UnlockableStage[];
}

function cycleLabelFromNav(json: {
  recruitmentCycleShortLabel?: string;
  recruitmentCycleLabel?: string;
}): string {
  if (
    typeof json.recruitmentCycleShortLabel === 'string' &&
    json.recruitmentCycleShortLabel
  ) {
    return json.recruitmentCycleShortLabel;
  }
  if (typeof json.recruitmentCycleLabel === 'string' && json.recruitmentCycleLabel) {
    return json.recruitmentCycleLabel.replace(/\s+Recruitment Cycle$/i, '');
  }
  return 'cycle';
}

function phaseAccessible(phase: RoundStatus, team: NavTeam): boolean {
  if (!team.round) return false;
  if (statusIndex(team.round.status) < statusIndex(phase)) return false;

  const unlockKey = unlockKeyForStatus(phase);
  if (unlockKey && !team.unlockedStages.includes(unlockKey)) return false;

  if (team.grantedStages === 'all') return true;
  if (!unlockKey) return phase === 'pre_application';
  return team.grantedStages.includes(unlockKey);
}

function resolvePhaseHref(status: RoundStatus, teams: NavTeam[]): string | null {
  for (const team of teams) {
    if (!phaseAccessible(status, team)) continue;
    const href = teamPhaseHref(team.id, status);
    if (href) return href;
  }
  return null;
}

/**
 * Shows a one-time (per session + phase) invite when the pipeline advances
 * into a new work phase. Mounted in the team portal shell.
 */
export function PhaseOpenedGate() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [cycleLabel, setCycleLabel] = useState('');
  const [href, setHref] = useState('');

  const evaluate = useCallback(async () => {
    try {
      const res = await fetch('/api/team/nav', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();

      // Final-selection celebration owns the closed / offers moment.
      if (json.finalSelectionComplete || json.status === 'closed') {
        setOpen(false);
        return;
      }

      const nextStatus = json.status as RoundStatus | null;
      if (!nextStatus || !isAnnounceablePhase(nextStatus)) {
        setOpen(false);
        return;
      }

      const teams = (json.teams ?? []) as NavTeam[];
      const destination = resolvePhaseHref(nextStatus, teams);
      if (!destination) {
        setOpen(false);
        return;
      }

      const label = cycleLabelFromNav(json);
      if (wasPhaseOpenedDismissed(label, nextStatus)) {
        setOpen(false);
        return;
      }

      setStatus(nextStatus);
      setCycleLabel(label);
      setHref(destination);
      setOpen(true);
    } catch {
      // Gate stays quiet on network errors.
    }
  }, []);

  useEffect(() => {
    void evaluate();
  }, [evaluate, pathname]);

  useEffect(() => {
    const onChange = () => void evaluate();
    window.addEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PIPELINE_PHASE_CHANGED_EVENT, onChange);
  }, [evaluate]);

  if (!status || !cycleLabel || !href) return null;

  return (
    <PhaseOpenedDialog
      open={open}
      status={status}
      cycleLabel={cycleLabel}
      href={href}
      onOpenChange={setOpen}
    />
  );
}
