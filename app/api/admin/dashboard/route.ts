export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeams, initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getTeamRoundStats } from '@/lib/rounds';
import { DEFAULT_GRADERS_PER_APPLICATION } from '@/lib/assignments';
import {
  formatTeamStatusSummary,
  getGlobalPipelineState,
  suggestedDashboardViewPhase,
} from '@/lib/pipeline-phase';
import {
  getTeamInterviewRoundStats,
  type TeamInterviewRoundStats,
} from '@/lib/interview-slots';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/dashboard', () => handleGet(req)),
  );
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teams = await getTeams();
    const globalState = await getGlobalPipelineState();
    const pipelineStatus = suggestedDashboardViewPhase(globalState.teams);
    const teamStatusSummary = formatTeamStatusSummary(globalState.teams);
    const roundByTeam = new Map(
      globalState.teams.map((t) => [t.teamId, t] as const),
    );

    const teamsWithRounds = await Promise.all(
      teams.map(async (team) => {
        const pipelineEntry = roundByTeam.get(team.id);
        const round = pipelineEntry?.round ?? null;
        const stats = round
          ? await getTeamRoundStats(team.id, round.id)
          : {
              applicationCount: 0,
              assignmentProgress: { total: 0, completed: 0 },
              gradersPerApplication: DEFAULT_GRADERS_PER_APPLICATION,
            };
        const displayRound = round
          ? {
              id: round.id,
              label: round.label,
              status: round.status,
            }
          : null;
        let interviewStatsByStage: {
          first_round: TeamInterviewRoundStats | null;
          final_round: TeamInterviewRoundStats | null;
        } = { first_round: null, final_round: null };
        if (round) {
          const [firstRound, finalRound] = await Promise.all([
            getTeamInterviewRoundStats(team.id, round.id, 'first_round'),
            getTeamInterviewRoundStats(team.id, round.id, 'final_round'),
          ]);
          interviewStatsByStage = { first_round: firstRound, final_round: finalRound };
        }
        return {
          ...team,
          round: displayRound,
          unlockedStages: pipelineEntry?.unlockedStages ?? [],
          interviewStatsByStage,
          ...stats,
        };
      }),
    );

    const applicationCount = teamsWithRounds.reduce((sum, t) => sum + t.applicationCount, 0);
    const assignmentProgress = teamsWithRounds.reduce(
      (acc, t) => ({
        total: acc.total + t.assignmentProgress.total,
        completed: acc.completed + t.assignmentProgress.completed,
      }),
      { total: 0, completed: 0 },
    );

    const gradersPerApplicationValues = teamsWithRounds
      .filter((t) => t.round)
      .map((t) => t.gradersPerApplication);
    const gradersPerApplication =
      gradersPerApplicationValues.length > 0
        ? gradersPerApplicationValues[0]
        : null;

    return NextResponse.json({
      pipelineStatus,
      teamStatusSummary,
      teams: teamsWithRounds,
      applicationCount,
      assignmentProgress,
      gradersPerApplication,
    });
  } catch (e) {
    console.error('GET /api/admin/dashboard failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
