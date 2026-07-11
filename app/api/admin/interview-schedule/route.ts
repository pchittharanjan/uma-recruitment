export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import {
  getInterviewScheduleConfig,
  saveInterviewScheduleConfig,
} from '@/lib/interview-schedule-config';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(req: NextRequest) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const config = await getInterviewScheduleConfig();
    return NextResponse.json(config);
  } catch (e) {
    console.error('GET /api/admin/interview-schedule failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const body = (await req.json()) as {
      firstRoundDate?: string | null;
      firstRoundStartTime?: string;
      finalRoundDate?: string | null;
      finalRoundStartTime?: string;
      blockMinutes?: number;
      groupSize?: number;
      parallelGroupsPerBlock?: number;
    };

    const config = await saveInterviewScheduleConfig(body);
    return NextResponse.json(config);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    if (message.includes('must be between')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error('PATCH /api/admin/interview-schedule failed:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
