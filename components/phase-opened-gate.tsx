'use client';

import { useEffect, useState } from 'react';
import {
  isAnnounceablePhase,
  PhaseOpenedDialog,
  wasPhaseOpenedDismissed,
} from '@/components/phase-opened-dialog';
import { useTeamNav, type TeamNavSnapshot, type TeamNavTeam } from '@/components/team-nav-provider';
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

/** Match admin dashboard: empty pipeline still means coffee-chat / pre_application for portal users. */
function effectivePipelineStatus(nav: TeamNavSnapshot): RoundStatus | null {
  if (nav.status) return nav.status;
  if (nav.teams.length > 0) return 'pre_application';
  return null;
}

function hasTeamPortalAccess(team: TeamNavTeam): boolean {
  if (team.grantedStages === 'all') return true;
  return Array.isArray(team.grantedStages) && team.grantedStages.length > 0;
}

function phaseAccessible(
  phase: RoundStatus,
  team: TeamNavTeam,
  globalStatus: RoundStatus | null,
): boolean {
  if (globalStatus === 'closed' || team.round?.status === 'closed') {
    return hasTeamPortalAccess(team);
  }

  // Coffee chats are org-wide — any team-portal user with team access qualifies.
  if (phase === 'pre_application') {
    if (globalStatus && statusIndex(globalStatus) < statusIndex('pre_application')) {
      return false;
    }
    return hasTeamPortalAccess(team);
  }

  if (!team.round) return false;
  if (statusIndex(team.round.status) < statusIndex(phase)) return false;

  const unlockKey = unlockKeyForStatus(phase);
  if (unlockKey && !team.unlockedStages.includes(unlockKey)) return false;

  if (team.grantedStages === 'all') return true;
  if (!unlockKey) return false;
  return team.grantedStages.includes(unlockKey);
}

function resolvePhaseHref(
  status: RoundStatus,
  teams: TeamNavTeam[],
  globalStatus: RoundStatus | null,
): string | null {
  if (status === 'pre_application') {
    for (const team of teams) {
      if (phaseAccessible('pre_application', team, globalStatus)) {
        return '/coffee-chats';
      }
    }
    return null;
  }

  for (const team of teams) {
    if (!phaseAccessible(status, team, globalStatus)) continue;
    const href = teamPhaseHref(team.id, status);
    if (href) return href;
  }
  return null;
}

/**
 * Shows a one-time (per session + phase) invite when the pipeline advances
 * into a new work phase. Mounted in the team portal shell.
 */
export function PhaseOpenedGate({ userName }: { userName: string }) {
  const { nav, loading } = useTeamNav();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [cycleLabel, setCycleLabel] = useState('');
  const [href, setHref] = useState('');

  useEffect(() => {
    if (loading || !nav) return;

    if (nav.finalSelectionComplete || nav.status === 'closed') {
      setOpen(false);
      return;
    }

    const nextStatus = effectivePipelineStatus(nav);
    if (!nextStatus || !isAnnounceablePhase(nextStatus)) {
      setOpen(false);
      return;
    }

    const destination = resolvePhaseHref(nextStatus, nav.teams, nav.status);
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
  }, [nav, loading]);

  if (!status || !cycleLabel || !href) return null;

  return (
    <PhaseOpenedDialog
      open={open}
      status={status}
      cycleLabel={cycleLabel}
      href={href}
      userName={userName}
      onOpenChange={setOpen}
    />
  );
}
