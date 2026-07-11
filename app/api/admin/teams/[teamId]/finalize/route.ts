export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { finalizeTeamRound } from '@/lib/team-dashboard';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const body = await req.json();
    const topN = body.topN as number | undefined;
    const force = Boolean(body.force);

    if (!topN || typeof topN !== 'number' || topN < 1) {
      return NextResponse.json({ error: 'topN must be a positive number' }, { status: 400 });
    }

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const result = await finalizeTeamRound(teamId, round.id, { topN, force });
    if (result.incompleteCount) {
      return NextResponse.json(
        {
          error: `${result.incompleteCount} assignments are still pending. Pass force:true to finalize anyway.`,
          incompleteCount: result.incompleteCount,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, roundId: round.id });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
