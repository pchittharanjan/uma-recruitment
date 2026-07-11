export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  commitDeliberationsFinalSelection,
  isDeliberationsFinalSelectionComplete,
  parseDeliberationsBoardLayout,
  getDeliberationsBoardLayout,
  serializeDeliberationsLayout,
  applyDeliberationsLayout,
  buildDeliberationsBoard,
} from '@/lib/deliberations';
import { communicationsHref } from '@/lib/communications-stages';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
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
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }
    if (round.status !== 'deliberations') {
      return NextResponse.json(
        { error: 'Final selection can only be completed during Deliberations.' },
        { status: 409 },
      );
    }

    if (await isDeliberationsFinalSelectionComplete(teamId, round.id)) {
      return NextResponse.json(
        {
          error: 'Final selection is already complete for this team.',
          alreadyComplete: true,
          communicationsHref: communicationsHref('final_round', teamId),
        },
        { status: 409 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as { layout?: unknown };
    let layout = parseDeliberationsBoardLayout(body.layout);
    if (!layout) {
      layout = await getDeliberationsBoardLayout(teamId, round.id);
    }
    if (!layout) {
      const board = await buildDeliberationsBoard(teamId, round.id);
      layout = serializeDeliberationsLayout(
        applyDeliberationsLayout(board.candidates, null),
      );
    }

    const result = await commitDeliberationsFinalSelection(
      teamId,
      round.id,
      layout,
      admin.id,
    );

    return NextResponse.json({
      success: true,
      team,
      ...result,
      communicationsHref: communicationsHref('final_round', teamId),
      message: `Locked ${result.offeredCount} offer${result.offeredCount === 1 ? '' : 's'} and ${result.rejectedCount} rejection${result.rejectedCount === 1 ? '' : 's'} for ${team.name}.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (
      message.includes('Accept') ||
      message.includes('already complete') ||
      message.includes('offer limit')
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('POST /api/admin/teams/[teamId]/deliberations/finalize failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
