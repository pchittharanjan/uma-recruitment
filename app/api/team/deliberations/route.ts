export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import {
  buildDeliberationsBoard,
  getDeliberationsPersonalBoardLayout,
  isDeliberationsFinalSelectionComplete,
  parseDeliberationsBoardLayout,
  saveDeliberationsPersonalBoardLayout,
} from '@/lib/deliberations';
import { assertPipelineWritable, isPipelineClosed } from '@/lib/pipeline-writable';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    if (!(await canUserAccessTeamStage(user, teamId, 'deliberations'))) {
      return forbidden('Deliberations are not open for you yet.');
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    const [board, personalLayout, selectionComplete, pipelineClosed] = await Promise.all([
      buildDeliberationsBoard(teamId, round.id),
      getDeliberationsPersonalBoardLayout(teamId, round.id, user.id),
      isDeliberationsFinalSelectionComplete(teamId, round.id),
      round.status === 'closed' ? Promise.resolve(true) : isPipelineClosed(),
    ]);

    // Personal scratch board — never seed from the admin official layout.
    board.layout = personalLayout;

    const readOnly = pipelineClosed || selectionComplete;

    return NextResponse.json({
      team,
      round,
      board,
      personalBoard: true,
      canSave: !readOnly,
      canFinalize: false,
      readOnly,
      autosave: !readOnly,
      selectionComplete,
      canRequestOverCap: false,
      pipelineClosed,
    });
  } catch (e) {
    console.error('GET /api/team/deliberations failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Autosave this user's personal deliberations board for team+round. */
export async function PUT(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;

    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    if (!(await canUserAccessTeamStage(user, teamId, 'deliberations'))) {
      return forbidden('Deliberations are not open for you yet.');
    }

    const team = await getTeamById(teamId);
    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const round = await getActiveRoundForTeam(teamId);
    if (!round) {
      return NextResponse.json({ error: 'No active round for this team.' }, { status: 400 });
    }

    if (await isDeliberationsFinalSelectionComplete(teamId, round.id)) {
      return NextResponse.json(
        { error: 'Final selection is complete. Your personal board is locked.' },
        { status: 403 },
      );
    }

    const body = (await req.json()) as { layout?: unknown };
    const layout = parseDeliberationsBoardLayout(body.layout);
    if (!layout) {
      return NextResponse.json(
        { error: 'Invalid layout. Expected columns (pool/considering/accept) and rejected.' },
        { status: 400 },
      );
    }

    const saved = await saveDeliberationsPersonalBoardLayout(
      teamId,
      round.id,
      user.id,
      layout,
    );
    return NextResponse.json({ success: true, layout: saved });
  } catch (e) {
    console.error('PUT /api/team/deliberations failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
