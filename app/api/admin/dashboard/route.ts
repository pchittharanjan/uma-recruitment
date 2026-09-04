export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { buildAdminDashboardPayload } from '@/lib/admin-workspace-data';
import { runWithRequestCache } from '@/lib/request-cache';
import { withPerfLog } from '@/lib/perf-log';

export async function GET(req: NextRequest) {
  return runWithRequestCache(() =>
    withPerfLog('GET /api/admin/dashboard', () => handleGet(req)),
  );
}

async function handleGet(req: NextRequest) {
  try {
    await initDb();
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const data = await buildAdminDashboardPayload(admin.id);
    return NextResponse.json(data);
  } catch (e) {
    console.error('GET /api/admin/dashboard failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
