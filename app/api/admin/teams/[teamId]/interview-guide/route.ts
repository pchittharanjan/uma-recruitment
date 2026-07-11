export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import {
  interviewGuideForApi,
  normalizeGuideInput,
  validateInterviewGuide,
  type InterviewGuide,
  type InterviewGuideStage,
} from '@/lib/interview-guide';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  getInterviewGuidesForRound,
  saveInterviewGuideForRound,
} from '@/lib/interview-slots';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

const STAGES: InterviewGuideStage[] = ['first_round', 'final_round'];

function isInterviewGuideStage(value: string): value is InterviewGuideStage {
  return STAGES.includes(value as InterviewGuideStage);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const guides = await getInterviewGuidesForRound(round.id);

    return NextResponse.json({
      team,
      round: { id: round.id, label: round.label, status: round.status },
      guides: {
        first_round: interviewGuideForApi(guides.first_round),
        final_round: interviewGuideForApi(guides.final_round),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
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
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 404 });
    }

    const body = (await req.json()) as {
      stage?: string;
      guide?: InterviewGuide | null;
    };

    if (!body.stage || !isInterviewGuideStage(body.stage)) {
      return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
    }

    if (body.guide === null) {
      await saveInterviewGuideForRound(round.id, body.stage, null);
      return NextResponse.json({ success: true, guide: null });
    }

    if (!body.guide || typeof body.guide !== 'object') {
      return NextResponse.json({ error: 'Guide is required.' }, { status: 400 });
    }

    const normalized = normalizeGuideInput(body.guide);
    if (!normalized) {
      return NextResponse.json({ error: 'Invalid guide format.' }, { status: 400 });
    }

    const validationError = validateInterviewGuide(normalized);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    await saveInterviewGuideForRound(round.id, body.stage, normalized);

    return NextResponse.json({
      success: true,
      guide: interviewGuideForApi(normalized),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message === 'Round settings not found.') {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    console.error(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
