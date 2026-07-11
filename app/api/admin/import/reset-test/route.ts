export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { purgeTestRecruitmentData } from '@/lib/test-data-reset';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const result = await purgeTestRecruitmentData();
    return NextResponse.json(result);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to erase test data.' }, { status: 500 });
  }
}
