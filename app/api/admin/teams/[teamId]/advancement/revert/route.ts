export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { revertTeamAdvancement } from '@/lib/advancement-admin';
import type { AdvancementFromStage } from '@/lib/advancement-submissions-types';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

function parseFromStage(value: unknown): AdvancementFromStage | null {
  return value === 'first_round' || value === 'application' ? value : null;
}

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

    const body = await req.json().catch(() => ({}));
    const fromStage = parseFromStage(body.fromStage);
    if (!fromStage) {
      return NextResponse.json(
        { error: 'fromStage must be "application" or "first_round".' },
        { status: 400 },
      );
    }

    const result = await revertTeamAdvancement(admin, teamId, round.id, fromStage);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status = message.includes('cannot') || message.includes('pending') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
