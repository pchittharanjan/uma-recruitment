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
import { unauthorized } from '@/lib/auth';
import type { UnlockableStage } from '@/lib/stages';
import { getRecruitmentCycleLabel, getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';
import { isOrgFinalSelectionComplete } from '@/lib/org-final-selection-status';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teams = await getAccessibleTeams(user);
    const globalState = await getGlobalPipelineState();
    const [recruitmentCycleLabel, recruitmentCycleShortLabel, finalSelectionComplete] =
      await Promise.all([
        getRecruitmentCycleLabel(),
        getRecruitmentCycleShortLabel(),
        isOrgFinalSelectionComplete(),
      ]);

    const teamNav = await Promise.all(
      teams.map(async (team) => {
        const round = await getActiveRoundForTeam(team.id);
        const granted = await getGrantedStagesForUser(user, team.id);
        const unlocks = round ? await getRoundStageUnlocks(round.id) : [];
        const interviewOnlyStage = await getInterviewOnlyScope(user, team.id);

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
          grantedStages: granted === 'all' ? ('all' as const) : granted,
          unlockedStages:
            globalState.unlockedStages.length > 0
              ? globalState.unlockedStages
              : unlocks.map((u) => u.stage),
          interviewOnlyStage,
        };
      }),
    );

    const pipelineClosed = globalState.status === 'closed';

    return NextResponse.json({
      status: globalState.status,
      unlockedStages: globalState.unlockedStages,
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
