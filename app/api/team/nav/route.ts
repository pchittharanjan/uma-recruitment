export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAccessibleTeams } from '@/lib/access';
import { listDirectorTeamIdsForUser } from '@/lib/directors';
import { initDb } from '@/lib/db';
import { getActiveRoundsByTeam } from '@/lib/pipeline-phase';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  getGrantedStagesForUser,
  getInterviewOnlyScope,
  getRoundStageUnlocks,
} from '@/lib/stage-access';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { runWithRequestCache } from '@/lib/request-cache';
import { unauthorized } from '@/lib/auth';
import type { UnlockableStage } from '@/lib/stages';
import { statusIndex, UNLOCKABLE_STAGES } from '@/lib/stages';
import { getRecruitmentCycleLabel, getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { isOrgFinalSelectionComplete } from '@/lib/org-final-selection-status';
import { withPerfLog } from '@/lib/perf-log';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() => withPerfLog('GET /api/team/nav', () => handleGet(req)));
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const [teams, activeRounds, recruitmentCycleLabel, recruitmentCycleShortLabel, finalSelectionComplete, directorTeamIds] =
      await Promise.all([
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
    /** Canonical summary for org-wide gates (coffee chats); per-team round.status is authoritative elsewhere. */
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
        // Closed archive: everyone with team access can browse all phases (view-only).
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
          grantedStages: archiveBrowse ? ('all' as const) : granted === 'all' ? ('all' as const) : granted,
          unlockedStages: archiveBrowse
            ? [...UNLOCKABLE_STAGES]
            : unlocks.map((u) => u.stage),
          interviewOnlyStage: archiveBrowse ? null : interviewOnlyStage,
          isDirector: directorTeamIdSet.has(team.id),
        };
      }),
    );

    return NextResponse.json({
      status: orgPipelineStatus,
      unlockedStages: [],
      teams: teamNav,
      isExec: user.role === 'exec',
      pipelineClosed,
      recruitmentComplete: pipelineClosed,
      finalSelectionComplete,
      recruitmentCycleLabel,
      recruitmentCycleShortLabel,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export type TeamNavTeam = {
  id: number;
  name: string;
  round: { id: number; label: string; status: string } | null;
  grantedStages: UnlockableStage[] | 'all';
  unlockedStages: UnlockableStage[];
  interviewOnlyStage: string | null;
  isDirector: boolean;
};
