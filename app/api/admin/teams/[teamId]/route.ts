export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { buildTeamDashboard, listGraderAssignments } from '@/lib/team-dashboard';
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
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    const myAssignments = round
      ? await listGraderAssignments(admin.id, teamId, 'application')
      : [];
    const myGrading =
      myAssignments.length > 0
        ? {
            total: myAssignments.length,
            completed: myAssignments.filter((a) => a.status === 'completed').length,
          }
        : null;

    const interviewStageForMine =
      round?.status === 'final_round'
        ? 'final_round'
        : round?.status === 'first_round'
          ? 'first_round'
          : null;
    const myInterviewAssignments =
      round && interviewStageForMine
        ? await listGraderAssignments(admin.id, teamId, interviewStageForMine)
        : [];
    const myInterviewing =
      myInterviewAssignments.length > 0
        ? {
            stage: interviewStageForMine as 'first_round' | 'final_round',
            total: myInterviewAssignments.length,
            completed: myInterviewAssignments.filter((a) => a.status === 'completed').length,
          }
        : null;

    if (!round) {
      return NextResponse.json({
        team,
        round: null,
        dashboard: null,
        interviewStats: null,
        myGrading,
        myInterviewing,
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
        myGrading,
        myInterviewing,
      });
    }

    // Application phase + closed archive: full grading dashboard for admin browse/edit.
    if (round.status === 'application' || round.status === 'closed') {
      const dashboard = await buildTeamDashboard(teamId, round.id, { blind: false });
      return NextResponse.json({
        team,
        round,
        dashboard,
        interviewStats: null,
        myGrading,
        myInterviewing,
      });
    }

    return NextResponse.json({
      team,
      round,
      dashboard: null,
      interviewStats: null,
      myGrading,
      myInterviewing,
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId] failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
