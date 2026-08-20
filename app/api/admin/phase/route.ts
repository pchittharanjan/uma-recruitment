export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, type RoundStatus } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { buildAdminPhasePayload } from '@/lib/admin-workspace-data';
import { PIPELINE_PHASES } from '@/lib/stages';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

const PIPELINE_STATUSES = new Set(PIPELINE_PHASES.map((p) => p.status));

function parseChecklistStatus(raw: string | null): RoundStatus | null {
  if (!raw || !PIPELINE_STATUSES.has(raw as RoundStatus)) return null;
  return raw as RoundStatus;
}

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/phase', async () => {
      try {
        await initDb();
        if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

        const light = req.nextUrl.searchParams.get('light') === '1';
        const checklistStatus = parseChecklistStatus(
          req.nextUrl.searchParams.get('checklistStatus'),
        );

        const payload = await buildAdminPhasePayload({
          includeChecklist: !light || Boolean(checklistStatus),
          checklistStatus,
        });
        return NextResponse.json(payload);
      } catch (e) {
        console.error('GET /api/admin/phase failed:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}
