export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  getOutcomeEmailStatus,
  resolveOutcomeEmailStageParam,
} from '@/lib/communications';
import { getActiveRoundsByTeam, getGlobalPipelineState } from '@/lib/pipeline-phase';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const pipeline = await getGlobalPipelineState();
    const fromStage = resolveOutcomeEmailStageParam(
      req.nextUrl.searchParams.get('fromStage') ??
        req.nextUrl.searchParams.get('view'),
      pipeline.status,
    );

    const teams = await getActiveRoundsByTeam();
    const withRound = teams.filter((t) => t.round);

    const rows = await Promise.all(
      withRound.map(async (t) => {
        const status = await getOutcomeEmailStatus(t.teamId, t.round!.id, fromStage);
        return {
          team: { id: t.teamId, name: t.teamName },
          round: t.round,
          fromStage,
          passCount: status.passCount,
          rejectCount: status.rejectCount,
          passNotifiedAt: status.passNotifiedAt,
          rejectNotifiedAt: status.rejectNotifiedAt,
          complete: status.complete,
        };
      }),
    );

    const completeCount = rows.filter((r) => r.complete).length;

    return NextResponse.json({
      fromStage,
      teams: rows,
      completeCount,
      totalTeams: rows.length,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
