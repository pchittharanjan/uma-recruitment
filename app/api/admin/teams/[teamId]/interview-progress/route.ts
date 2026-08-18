export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getTeamInterviewProgress } from '@/lib/admin-team-status';
import type { InterviewSlotStage } from '@/lib/interview-slots';

const INTERVIEW_STAGES: InterviewSlotStage[] = ['first_round', 'final_round'];

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
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const stageParam = req.nextUrl.searchParams.get('stage');
    const stage = (stageParam ?? round.status) as InterviewSlotStage;
    if (!INTERVIEW_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: 'Interview Progress is only available during first or final round.' },
        { status: 400 },
      );
    }

    const progress = await getTeamInterviewProgress(teamId, round.id, stage);

    return NextResponse.json({
      team,
      round,
      progress,
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/interview-progress failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
