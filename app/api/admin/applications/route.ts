export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, type ApplicationStage, type RejectedFromStage } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { listAdminApplications } from '@/lib/admin-applications';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

const STAGES: ApplicationStage[] = [
  'application',
  'first_round',
  'final_round',
  'deliberations',
  'advanced',
  'rejected',
];

const REJECTED_FROM_STAGES: RejectedFromStage[] = [
  'application',
  'first_round',
  'final_round',
  'deliberations',
];

function parseStageFilter(stageRaw: string | null): {
  stage?: ApplicationStage;
  rejectedFromStage?: RejectedFromStage;
} {
  if (!stageRaw || stageRaw === 'all') return {};

  if (stageRaw.startsWith('rejected_at_')) {
    const from = stageRaw.slice('rejected_at_'.length) as RejectedFromStage;
    if (REJECTED_FROM_STAGES.includes(from)) {
      return { rejectedFromStage: from };
    }
  }

  if (STAGES.includes(stageRaw as ApplicationStage)) {
    return { stage: stageRaw as ApplicationStage };
  }

  return {};
}

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/applications', async () => {
      try {
        await initDb();
        if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

        const { searchParams } = new URL(req.url);
        const q = searchParams.get('q') ?? undefined;
        const teamIdRaw = searchParams.get('teamId');
        const stageRaw = searchParams.get('stage');
        const limitRaw = searchParams.get('limit');
        const offsetRaw = searchParams.get('offset');

        const teamId =
          teamIdRaw && teamIdRaw !== 'all' ? Number.parseInt(teamIdRaw, 10) : undefined;
        if (teamIdRaw && teamIdRaw !== 'all' && !Number.isFinite(teamId)) {
          return NextResponse.json({ error: 'Invalid teamId.' }, { status: 400 });
        }

        const { stage, rejectedFromStage } = parseStageFilter(stageRaw);

        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
        const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined;

        const data = await listAdminApplications({
          q,
          teamId,
          stage,
          rejectedFromStage,
          limit,
          offset,
        });
        return NextResponse.json(data);
      } catch (e) {
        console.error('GET /api/admin/applications failed:', e);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
      }
    }),
  );
}
