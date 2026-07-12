export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getAccessibleTeams } from '@/lib/access';
import { initDb } from '@/lib/db';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
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
import { UNLOCKABLE_STAGES } from '@/lib/stages';
import { getRecruitmentCycleLabel, getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { isOrgFinalSelectionComplete } from '@/lib/org-final-selection-status';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() => handleGet(req));
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const [teams, globalState, recruitmentCycleLabel, recruitmentCycleShortLabel, finalSelectionComplete] =
      await Promise.all([
        getAccessibleTeams(user),
        getGlobalPipelineState(),
        getRecruitmentCycleLabel(),
        getRecruitmentCycleShortLabel(),
        isOrgFinalSelectionComplete(),
      ]);
    const pipelineClosed = globalState.status === 'closed';

    const teamNav = await Promise.all(
      teams.map(async (team) => {
        const [round, granted, interviewOnlyStage] = await Promise.all([
          getActiveRoundForTeam(team.id),
          getGrantedStagesForUser(user, team.id),
          getInterviewOnlyScope(user, team.id),
        ]);
        const unlocks = round ? await getRoundStageUnlocks(round.id) : [];
        const hasAnyAccess = granted === 'all' || granted.length > 0;
        // Closed archive: everyone with team access can browse all phases (view-only).
        const archiveBrowse = pipelineClosed && hasAnyAccess;

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
            : globalState.unlockedStages.length > 0
              ? globalState.unlockedStages
              : unlocks.map((u) => u.stage),
          interviewOnlyStage: archiveBrowse ? null : interviewOnlyStage,
        };
      }),
    );

    return NextResponse.json({
      status: globalState.status,
      unlockedStages: pipelineClosed ? [...UNLOCKABLE_STAGES] : globalState.unlockedStages,
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
};
