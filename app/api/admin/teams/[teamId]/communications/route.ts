export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  getRoundCommunications,
  markOutcomeNotificationsSent,
  resolveOutcomeEmailStageParam,
  saveRoundCommunications,
  type OutcomeEmailStage,
  type RoundCommunicationsTemplates,
} from '@/lib/communications';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';

async function resolveStage(req: NextRequest): Promise<OutcomeEmailStage> {
  const pipeline = await getGlobalPipelineState();
  return resolveOutcomeEmailStageParam(
    req.nextUrl.searchParams.get('fromStage') ??
      req.nextUrl.searchParams.get('view'),
    pipeline.status,
  );
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

    const fromStage = await resolveStage(req);
    const data = await getRoundCommunications(teamId, round.id, fromStage);
    return NextResponse.json({ team, round, ...data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Outcome emails are intentionally writable after the cycle is closed —
 * sending wrap-up mail (and marking it sent) is the last admin step.
 */
export async function PUT(
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

    const fromStage = await resolveStage(req);
    const body = (await req.json()) as Partial<RoundCommunicationsTemplates> & {
      fromStage?: string;
    };
    const stage = body.fromStage
      ? resolveOutcomeEmailStageParam(body.fromStage, null)
      : fromStage;

    const templates: RoundCommunicationsTemplates = {
      passSubject: (body.passSubject ?? '').trim(),
      passBody: (body.passBody ?? '').trim(),
      rejectSubject: (body.rejectSubject ?? '').trim(),
      rejectBody: (body.rejectBody ?? '').trim(),
    };

    await saveRoundCommunications(round.id, stage, templates);
    return NextResponse.json({ success: true, fromStage: stage, templates });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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

    const queryStage = await resolveStage(req);
    const body = (await req.json()) as {
      action?: string;
      which?: string;
      fromStage?: string;
    };
    if (body.action !== 'mark_sent') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const which = body.which;
    if (which !== 'pass' && which !== 'reject' && which !== 'both') {
      return NextResponse.json({ error: 'which must be pass, reject, or both.' }, { status: 400 });
    }

    const fromStage = body.fromStage
      ? resolveOutcomeEmailStageParam(body.fromStage, null)
      : queryStage;

    await markOutcomeNotificationsSent(round.id, fromStage, which);
    const data = await getRoundCommunications(teamId, round.id, fromStage);
    return NextResponse.json({ team, round, ...data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
