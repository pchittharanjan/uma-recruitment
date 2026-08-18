export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import {
  interviewGuideForApi,
  type InterviewGuideStage,
} from '@/lib/interview-guide';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getInterviewGuidesForRound } from '@/lib/interview-slots';

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

function isInterviewGuideStage(value: string): value is InterviewGuideStage {
  return STAGES.includes(value as InterviewGuideStage);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string; stage: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw, stage: stageRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }
    if (!isInterviewGuideStage(stageRaw)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const guides = await getInterviewGuidesForRound(round.id);
    const guide = interviewGuideForApi(guides[stageRaw]);

    return NextResponse.json({
      team: { id: team.id, name: team.name },
      stage: stageRaw,
      guide,
      preview: true,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
