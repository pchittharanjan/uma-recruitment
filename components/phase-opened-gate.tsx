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

/** Most advanced round status among the user's teams (per-team is source of truth). */
function effectivePipelineStatus(nav: TeamNavSnapshot): RoundStatus | null {
  const statuses = nav.teams
    .filter((team) => team.round)
    .map((team) => team.round!.status as RoundStatus);
  if (statuses.length === 0) {
    return nav.teams.length > 0 ? 'pre_application' : null;
  }
  return statuses.reduce((latest, status) =>
    statusIndex(status) > statusIndex(latest) ? status : latest,
  );
}

function hasTeamPortalAccess(team: TeamNavTeam): boolean {
  if (team.grantedStages === 'all') return true;
  return Array.isArray(team.grantedStages) && team.grantedStages.length > 0;
}

function phaseAccessible(
  phase: RoundStatus,
  team: TeamNavTeam,
  orgPipelineStatus: RoundStatus | null,
): boolean {
  if (team.round?.status === 'closed') {
    return hasTeamPortalAccess(team);
  }

  // Coffee chats are org-wide — any team-portal user with team access qualifies.
  if (phase === 'pre_application') {
    if (orgPipelineStatus && statusIndex(orgPipelineStatus) < statusIndex('pre_application')) {
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
  orgPipelineStatus: RoundStatus | null,
): { href: string; teamName: string | null; isDirector: boolean } | null {
  if (status === 'pre_application') {
    for (const team of teams) {
      if (phaseAccessible('pre_application', team, orgPipelineStatus)) {
        return { href: '/coffee-chats', teamName: team.name, isDirector: team.isDirector === true };
      }
    }
    return null;
  }

  for (const team of teams) {
    if (!phaseAccessible(status, team, orgPipelineStatus)) continue;
    const href = teamPhaseHref(team.id, status);
    if (href) {
      return { href, teamName: team.name, isDirector: team.isDirector === true };
    }
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
  const [teamName, setTeamName] = useState<string | null>(null);
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    if (loading || !nav) return;

    if (nav.finalSelectionComplete || nav.pipelineClosed) {
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
    setHref(destination.href);
    setTeamName(destination.teamName);
    setIsDirector(destination.isDirector);
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
      teamName={teamName}
      isDirector={isDirector}
      onOpenChange={setOpen}
    />
  );
}
