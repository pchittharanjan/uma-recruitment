export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { buildTeamDashboard } from '@/lib/team-dashboard';
import {
  getTeamInterviewRoundStats,
  type InterviewSlotStage,
} from '@/lib/interview-slots';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({
        team,
        round: null,
        dashboard: null,
        interviewStats: null,
      });
    }

    // Fast path: interview phases only need lightweight stats.
    if (round.status === 'first_round' || round.status === 'final_round') {
      let interviewStats = null;
      try {
        interviewStats = await getTeamInterviewRoundStats(
          teamId,
          round.id,
          round.status as InterviewSlotStage,
        );
      } catch (err) {
        console.error('getTeamInterviewRoundStats failed:', err);
      }

      return NextResponse.json({
        team,
        round,
        dashboard: null,
        interviewStats,
      });
    }

    // Application Phase: full grading dashboard.
    if (round.status === 'application') {
      const dashboard = await buildTeamDashboard(teamId, round.id, { blind: false });
      return NextResponse.json({
        team,
        round,
        dashboard,
        interviewStats: null,
      });
    }

    return NextResponse.json({
      team,
      round,
      dashboard: null,
      interviewStats: null,
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId] failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
