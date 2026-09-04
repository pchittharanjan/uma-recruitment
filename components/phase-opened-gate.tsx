'use client';

import { useEffect, useState } from 'react';
import {
  isAnnounceablePhase,
  PhaseOpenedDialog,
  wasPhaseOpenedDismissed,
} from '@/components/phase-opened-dialog';
import {
  PhaseSettingUpDialog,
  wasPhaseSettingUpDismissed,
} from '@/components/phase-setting-up-dialog';
import { useTeamNav, type TeamNavSnapshot, type TeamNavTeam } from '@/components/team-nav-provider';
import type { RoundStatus } from '@/lib/db';
import {
  statusIndex,
  teamOverviewHref,
  teamPhaseHref,
  unlockKeyForStatus,
} from '@/lib/stages';
import { phaseLabelForTeam, pipelinePhasesForTeam } from '@/lib/team-pipeline-profile';

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
        return {
          href: teamOverviewHref(team.id),
          teamName: team.name,
          isDirector: team.isDirector === true,
        };
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

/** Best link to an already-open earlier phase for this team. */
function resolveBrowseHref(
  team: TeamNavTeam,
  orgPipelineStatus: RoundStatus | null,
): string {
  if (!team.round) return teamOverviewHref(team.id);

  const currentIdx = statusIndex(team.round.status as RoundStatus);
  const phases = pipelinePhasesForTeam(team.name);

  for (let i = phases.length - 1; i >= 0; i--) {
    const phase = phases[i]!;
    if (statusIndex(phase.status) > currentIdx) continue;
    if (!phaseAccessible(phase.status, team, orgPipelineStatus)) continue;

    if (phase.status === 'pre_application') return teamOverviewHref(team.id);
    const href = teamPhaseHref(team.id, phase.status);
    if (href) return href;
  }

  return teamOverviewHref(team.id);
}

/** Team whose live phase was advanced but not unlocked yet. */
function findSettingUpPhase(nav: TeamNavSnapshot): {
  status: RoundStatus;
  team: TeamNavTeam;
  browseHref: string;
} | null {
  let best: {
    status: RoundStatus;
    team: TeamNavTeam;
    browseHref: string;
  } | null = null;

  for (const team of nav.teams) {
    if (!team.round || team.round.status === 'closed') continue;
    if (!hasTeamPortalAccess(team)) continue;

    const status = team.round.status as RoundStatus;
    if (!isAnnounceablePhase(status)) continue;

    const unlockKey = unlockKeyForStatus(status);
    if (!unlockKey || team.unlockedStages.includes(unlockKey)) continue;

    if (!best || statusIndex(status) > statusIndex(best.status)) {
      best = {
        status,
        team,
        browseHref: resolveBrowseHref(team, nav.status),
      };
    }
  }

  return best;
}

type GateMode = 'open' | 'setting-up';

/**
 * Shows a one-time (per session + phase) invite when the pipeline advances
 * into a new work phase, or a setup notice when the phase is advanced but locked.
 */
export function PhaseOpenedGate({ userName }: { userName: string }) {
  const { nav, loading } = useTeamNav();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<GateMode>('open');
  const [status, setStatus] = useState<RoundStatus | null>(null);
  const [cycleLabel, setCycleLabel] = useState('');
  const [href, setHref] = useState('');
  const [teamId, setTeamId] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  const [phaseLabel, setPhaseLabel] = useState('');
  const [isDirector, setIsDirector] = useState(false);

  useEffect(() => {
    if (loading || !nav) return;

    if (nav.finalSelectionComplete || nav.pipelineClosed) {
      setOpen(false);
      return;
    }

    const label = cycleLabelFromNav(nav);
    const pipelineStatus = effectivePipelineStatus(nav);
    if (!pipelineStatus || !isAnnounceablePhase(pipelineStatus)) {
      setOpen(false);
      return;
    }

    const destination = resolvePhaseHref(pipelineStatus, nav.teams, nav.status);
    if (destination && !wasPhaseOpenedDismissed(label, pipelineStatus)) {
      setMode('open');
      setStatus(pipelineStatus);
      setCycleLabel(label);
      setHref(destination.href);
      setTeamId(null);
      setTeamName(destination.teamName);
      setPhaseLabel('');
      setIsDirector(destination.isDirector);
      setOpen(true);
      return;
    }

    const settingUp = findSettingUpPhase(nav);
    if (
      settingUp &&
      !wasPhaseSettingUpDismissed(label, settingUp.status, settingUp.team.id)
    ) {
      setMode('setting-up');
      setStatus(settingUp.status);
      setCycleLabel(label);
      setHref(settingUp.browseHref);
      setTeamId(settingUp.team.id);
      setTeamName(settingUp.team.name);
      setPhaseLabel(phaseLabelForTeam(settingUp.status, settingUp.team.name));
      setIsDirector(settingUp.team.isDirector === true);
      setOpen(true);
      return;
    }

    setOpen(false);
  }, [nav, loading]);

  if (!status || !cycleLabel || !href) return null;

  if (mode === 'setting-up' && teamId != null && teamName) {
    return (
      <PhaseSettingUpDialog
        open={open}
        status={status}
        cycleLabel={cycleLabel}
        teamId={teamId}
        teamName={teamName}
        phaseLabel={phaseLabel}
        browseHref={href}
        userName={userName}
        onOpenChange={setOpen}
      />
    );
  }

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
