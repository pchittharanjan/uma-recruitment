export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { setOrgOverCapCode } from '@/lib/team-advancement-caps';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

/** Admin-only: set or replace the org-wide go-over code (hash for verify + plain for admin reveal). */
export async function PUT(req: NextRequest) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireAuth(req, { roles: ['admin'] });
    if (!user) return unauthorized();

    const body = await req.json();
    const code = typeof body.code === 'string' ? body.code : '';
    await setOrgOverCapCode(code, user.id);

    return NextResponse.json({ success: true, overCapCodeSet: true, overCapCode: code.trim() });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('cannot be empty') || message.includes('at least') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
