export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { forbidden, unauthorized } from '@/lib/auth';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { buildDeliberationsBoard, isDeliberationsFinalSelectionComplete } from '@/lib/deliberations';
import { isPipelineClosed } from '@/lib/pipeline-writable';

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

    const board = await buildDeliberationsBoard(teamId, round.id);
    const selectionComplete = await isDeliberationsFinalSelectionComplete(
      teamId,
      round.id,
    );

    return NextResponse.json({
      team,
      round,
      board,
      canSave: false,
      selectionComplete,
      pipelineClosed: round.status === 'closed' || (await isPipelineClosed()),
    });
  } catch (e) {
    console.error('GET /api/team/deliberations failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
