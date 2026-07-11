export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import {
  buildDeliberationsBoard,
  isDeliberationsFinalSelectionComplete,
  parseDeliberationsBoardLayout,
  saveDeliberationsBoardLayout,
} from '@/lib/deliberations';
import { assertPipelineWritable, isPipelineClosed } from '@/lib/pipeline-writable';

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

    const board = await buildDeliberationsBoard(teamId, round.id);
    const selectionComplete = await isDeliberationsFinalSelectionComplete(
      teamId,
      round.id,
    );
    // Admins keep write access after the cycle closes; team portal stays view-only.
    const pipelineClosed = await isPipelineClosed();

    return NextResponse.json({
      team,
      round,
      board,
      canSave: true,
      selectionComplete,
      pipelineClosed,
      // Don't put the admin board into read-only mode when closed.
      readOnly: false,
    });
  } catch (e) {
    console.error('GET /api/admin/teams/[teamId]/deliberations failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Persist kanban column membership, order, and rejected flags for this team+round. */
export async function PUT(
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

    const body = (await req.json()) as { layout?: unknown };
    const layout = parseDeliberationsBoardLayout(body.layout);
    if (!layout) {
      return NextResponse.json(
        { error: 'Invalid layout. Expected columns (pool/considering/accept) and rejected.' },
        { status: 400 },
      );
    }

    const saved = await saveDeliberationsBoardLayout(teamId, round.id, layout, admin.id);
    return NextResponse.json({ success: true, layout: saved });
  } catch (e) {
    console.error('PUT /api/admin/teams/[teamId]/deliberations failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
