import 'server-only';

import { getAccessibleTeams } from '@/lib/access';
import { listDirectorTeamIdsForUser } from '@/lib/directors';
import type { User } from '@/lib/db';
import { getActiveRoundsByTeam } from '@/lib/pipeline-phase';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  getGrantedStagesForUser,
  getInterviewOnlyScope,
  getRoundStageUnlocks,
} from '@/lib/stage-access';
import { statusIndex, UNLOCKABLE_STAGES } from '@/lib/stages';
import {
  getRecruitmentCycleLabel,
  getRecruitmentCycleShortLabel,
} from '@/lib/org-recruitment-cycle-server';
import { isOrgFinalSelectionComplete } from '@/lib/org-final-selection-status';
import type { TeamNavSnapshot } from '@/lib/team-nav-types';

export type { TeamNavSnapshot, TeamNavTeam } from '@/lib/team-nav-types';

export async function buildTeamNavSnapshot(user: User): Promise<TeamNavSnapshot> {
  const [
    teams,
    activeRounds,
    recruitmentCycleLabel,
    recruitmentCycleShortLabel,
    finalSelectionComplete,
    directorTeamIds,
  ] = await Promise.all([
    getAccessibleTeams(user),
    getActiveRoundsByTeam(),
    getRecruitmentCycleLabel(),
    getRecruitmentCycleShortLabel(),
    isOrgFinalSelectionComplete(),
    listDirectorTeamIdsForUser(user.id),
  ]);
  const directorTeamIdSet = new Set(directorTeamIds);

  const teamStatuses = activeRounds
    .filter((entry) => entry.round)
    .map((entry) => entry.round!.status);
  const allTeamsClosed =
    teamStatuses.length > 0 && teamStatuses.every((status) => status === 'closed');
  const pipelineClosed = allTeamsClosed;
  const orgPipelineStatus = pipelineClosed
    ? ('closed' as const)
    : teamStatuses.length > 0
      ? teamStatuses.reduce((lowest, status) =>
          statusIndex(status) < statusIndex(lowest) ? status : lowest,
        )
      : null;

  const teamNav = await Promise.all(
    teams.map(async (team) => {
      const [round, granted, interviewOnlyStage] = await Promise.all([
        getActiveRoundForTeam(team.id),
        getGrantedStagesForUser(user, team.id),
        getInterviewOnlyScope(user, team.id),
      ]);
      const teamPipelineClosed = round?.status === 'closed';
      const unlocks = round ? await getRoundStageUnlocks(round.id) : [];
      const hasAnyAccess = granted === 'all' || granted.length > 0;
      const archiveBrowse = teamPipelineClosed && hasAnyAccess;

      return {
        id: team.id,
        name: team.name,
        round: round
          ? {
              id: round.id,
              label: recruitmentCycleLabel,
              status: round.status,
            }
          : null,
        grantedStages: archiveBrowse
          ? ('all' as const)
          : granted === 'all'
            ? ('all' as const)
            : granted,
        unlockedStages: archiveBrowse
          ? [...UNLOCKABLE_STAGES]
          : unlocks.map((u) => u.stage),
        interviewOnlyStage: archiveBrowse ? null : interviewOnlyStage,
        isDirector: directorTeamIdSet.has(team.id),
      };
    }),
  );

  return {
    status: orgPipelineStatus,
    teams: teamNav,
    isExec: user.role === 'exec',
    finalSelectionComplete,
    pipelineClosed,
    recruitmentCycleShortLabel,
    recruitmentCycleLabel,
  };
}
