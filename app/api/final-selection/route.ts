export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { getSessionUserFromRequest, unauthorized } from '@/lib/auth';
import { getImpersonateTargetFromRequest } from '@/lib/impersonation';
import { getFinalSelectionByTeam } from '@/lib/final-selection';
import { getGlobalPipelineState } from '@/lib/pipeline-phase';
import { getRecruitmentCycleShortLabel } from '@/lib/org-recruitment-cycle-server';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const sessionUser = await getSessionUserFromRequest(req);
    if (!sessionUser) return unauthorized();

    const impersonateTarget = await getImpersonateTargetFromRequest(req);
    const user =
      impersonateTarget && sessionUser.role === 'admin'
        ? impersonateTarget
        : sessionUser;

    if (
      user.role !== 'admin' &&
      user.role !== 'exec' &&
      user.role !== 'ad_hoc_exec'
    ) {
      return unauthorized();
    }

    const [selection, pipeline, cycleLabel] = await Promise.all([
      getFinalSelectionByTeam(user),
      getGlobalPipelineState(),
      getRecruitmentCycleShortLabel(),
    ]);

    return NextResponse.json({
      ...selection,
      cycleLabel: selection.cycleLabel || cycleLabel,
      pipelineStatus: pipeline.status,
      recruitmentComplete: pipeline.status === 'closed',
      finalSelectionComplete: selection.complete,
    });
  } catch (e) {
    console.error('GET /api/final-selection failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
