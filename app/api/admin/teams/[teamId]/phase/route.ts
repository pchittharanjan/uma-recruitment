export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { getActiveRoundForTeam } from '@/lib/rounds';
import { getRoundStageUnlocks } from '@/lib/stage-access';
import {
  advanceTeamPipeline,
  lockTeamStage,
  unlockTeamStage,
} from '@/lib/pipeline-phase';
import {
  nextPipelineStatusForTeam,
  pipelinePhasesForTeam,
  unlockableStagesForTeam,
} from '@/lib/team-pipeline-profile';
import { type UnlockableStage, UNLOCKABLE_STAGES } from '@/lib/stages';

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
    const phases = pipelinePhasesForTeam(team.name);
    if (!round) {
      return NextResponse.json({ team, round: null, phases, unlockedStages: [] });
    }

    const unlocks = await getRoundStageUnlocks(round.id);

    return NextResponse.json({
      team,
      round: { id: round.id, label: round.label, status: round.status },
      phases,
      unlockedStages: unlocks.map((u) => u.stage),
      nextStatus: nextPipelineStatusForTeam(round.status, team.name),
      unlockableStages: unlockableStagesForTeam(team.name),
      managedPerTeam: true,
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
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const body = (await req.json()) as {
      action: 'advance' | 'unlock' | 'lock';
      stage?: UnlockableStage;
    };

    let result;
    if (body.action === 'advance') {
      result = await advanceTeamPipeline(teamId, admin.id);
    } else if (body.action === 'unlock') {
      if (!body.stage || !UNLOCKABLE_STAGES.includes(body.stage)) {
        return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
      }
      if (!unlockableStagesForTeam(team.name).includes(body.stage)) {
        return NextResponse.json(
          { error: `${body.stage} is not part of ${team.name}'s pipeline.` },
          { status: 400 },
        );
      }
      result = await unlockTeamStage(teamId, body.stage, admin.id);
    } else if (body.action === 'lock') {
      if (!body.stage || !UNLOCKABLE_STAGES.includes(body.stage)) {
        return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 });
      }
      result = await lockTeamStage(teamId, body.stage);
    } else {
      return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
    }

    return NextResponse.json({
      ...result,
      phases: pipelinePhasesForTeam(team.name),
      unlockableStages: unlockableStagesForTeam(team.name),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message.includes('no active round') || message.includes('final phase')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
