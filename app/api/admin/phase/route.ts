export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { getGlobalPipelineState, type GlobalPipelineState } from '@/lib/pipeline-phase';
import { getPhaseChecklistForStatus } from '@/lib/phase-checklist';
import { PIPELINE_PHASES } from '@/lib/stages';
import type { RoundStatus } from '@/lib/db';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

const PIPELINE_STATUSES = new Set(PIPELINE_PHASES.map((p) => p.status));

function parseChecklistStatus(raw: string | null): RoundStatus | null {
  if (!raw || !PIPELINE_STATUSES.has(raw as RoundStatus)) return null;
  return raw as RoundStatus;
}

function lightPhasePayload(state: GlobalPipelineState) {
  return {
    ...state,
    phases: PIPELINE_PHASES,
    pipelineClosed: state.status === 'closed',
  };
}

async function enrichPhaseResponse(
  state: GlobalPipelineState,
  checklistStatus?: RoundStatus | null,
) {
  const statusForChecklist = checklistStatus ?? state.status ?? 'pre_application';
  const checklist = await getPhaseChecklistForStatus(statusForChecklist, {
    unlockedStages: state.unlockedStages,
  });
  return { ...lightPhasePayload(state), checklist };
}

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/phase', async () => {
      try {
        await initDb();
        if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

        const state = await getGlobalPipelineState();
        const light = req.nextUrl.searchParams.get('light') === '1';
        const checklistStatus = parseChecklistStatus(
          req.nextUrl.searchParams.get('checklistStatus'),
        );

        // Shell / status-only consumers: skip expensive checklist fan-out.
        if (light && !checklistStatus) {
          return NextResponse.json(lightPhasePayload(state));
        }

        return NextResponse.json(await enrichPhaseResponse(state, checklistStatus));
      } catch (e) {
        console.error('GET /api/admin/phase failed:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}
