export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getRoundStageUnlocks } from '@/lib/stage-access';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { nextRoundStatus, PIPELINE_PHASES } from '@/lib/stages';

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
      return NextResponse.json({ team, round: null, phases: PIPELINE_PHASES, unlockedStages: [] });
    }

    const globalState = await getGlobalPipelineState();
    const unlocks = await getRoundStageUnlocks(round.id);
    const globalStatus = globalState.status ?? round.status;

    return NextResponse.json({
      team,
      round: { id: round.id, label: round.label, status: globalStatus },
      phases: PIPELINE_PHASES,
      unlockedStages: globalState.unlockedStages.length > 0
        ? globalState.unlockedStages
        : unlocks.map((u) => u.stage),
      nextStatus: nextRoundStatus(globalStatus),
      managedGlobally: true,
    });
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

    return NextResponse.json(
      {
        error:
          'Phases are managed globally. Use the Dashboard to advance phases or unlock stages for all teams.',
      },
      { status: 403 },
    );
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
