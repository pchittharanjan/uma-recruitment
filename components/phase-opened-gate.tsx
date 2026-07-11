'use client';

import { useEffect, useState } from 'react';
import {
  isAnnounceablePhase,
  PhaseOpenedDialog,
  wasPhaseOpenedDismissed,
} from '@/components/phase-opened-dialog';
import { useTeamNav, type TeamNavTeam } from '@/components/team-nav-provider';
import type { RoundStatus } from '@/lib/db';
import {
  statusIndex,
  teamPhaseHref,
  unlockKeyForStatus,
} from '@/lib/stages';

function cycleLabelFromNav(nav: {
  recruitmentCycleShortLabel?: string;
  recruitmentCycleLabel?: string;
}): string {
  if (nav.recruitmentCycleShortLabel) return nav.recruitmentCycleShortLabel;
  if (nav.recruitmentCycleLabel) {
    return nav.recruitmentCycleLabel.replace(/\s+Recruitment Cycle$/i, '');
  }
  return 'cycle';
}

function phaseAccessible(phase: RoundStatus, team: TeamNavTeam): boolean {
  if (!team.round) return false;
  if (statusIndex(team.round.status) < statusIndex(phase)) return false;

  const unlockKey = unlockKeyForStatus(phase);
  if (unlockKey && !team.unlockedStages.includes(unlockKey)) return false;

  if (team.grantedStages === 'all') return true;
  if (!unlockKey) return phase === 'pre_application';
  return team.grantedStages.includes(unlockKey);
}

function resolvePhaseHref(status: RoundStatus, teams: TeamNavTeam[]): string | null {
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
  const { nav } = useTeamNav();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [cycleLabel, setCycleLabel] = useState('');
  const [href, setHref] = useState('');

  useEffect(() => {
    if (!nav) return;

    if (nav.finalSelectionComplete || nav.status === 'closed') {
      setOpen(false);
      return;
    }

    const nextStatus = nav.status;
    if (!nextStatus || !isAnnounceablePhase(nextStatus)) {
      setOpen(false);
      return;
    }

    const destination = resolvePhaseHref(nextStatus, nav.teams);
    if (!destination) {
      setOpen(false);
      return;
    }

    const label = cycleLabelFromNav(nav);
    if (wasPhaseOpenedDismissed(label, nextStatus)) {
      setOpen(false);
      return;
    }

    setStatus(nextStatus);
    setCycleLabel(label);
    setHref(destination);
    setOpen(true);
  }, [nav]);

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
