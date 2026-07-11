export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { simulateTeamInterviewScores, simulateTeamScores } from '@/lib/simulate-scores';
import type { InterviewGuideStage } from '@/lib/interview-guide';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

const INTERVIEW_STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round.' }, { status: 404 });
    }

    if (round.status === 'closed') {
      return NextResponse.json({ error: 'Round is already closed.' }, { status: 409 });
    }

    let stage: string = 'application';
    try {
      const body = (await req.json()) as { stage?: string };
      if (body.stage) stage = body.stage;
    } catch {
      // empty body defaults to application stage
    }

    if (stage === 'application') {
      const result = await simulateTeamScores(teamId, round.id);
      return NextResponse.json({ ...result, stage });
    }

    if (INTERVIEW_STAGES.includes(stage as InterviewGuideStage)) {
      const result = await simulateTeamInterviewScores(
        teamId,
        round.id,
        stage as InterviewGuideStage,
      );
      return NextResponse.json({ ...result, stage });
    }

    return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error.';
    if (message.includes('No scored')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
