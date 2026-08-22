export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
import { assertPipelineWritable } from '@/lib/pipeline-writable';
import { reassignApplicationAssignment } from '@/lib/assignment-admin';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { teamId: teamIdRaw } = await params;
    const teamId = Number.parseInt(teamIdRaw, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const { assignmentId, newUserId: newUserIdRaw } = await req.json();
    if (!assignmentId || typeof assignmentId !== 'number') {
      return NextResponse.json({ error: 'assignmentId is required' }, { status: 400 });
    }
    if (!newUserIdRaw || typeof newUserIdRaw !== 'number') {
      return NextResponse.json({ error: 'newUserId is required' }, { status: 400 });
    }

    try {
      const result = await reassignApplicationAssignment(teamId, assignmentId, newUserIdRaw);
      return NextResponse.json({ success: true, newUserId: newUserIdRaw, ...result });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Reassign failed.';
      const status =
        message === 'Assignment not found'
          ? 404
          : 400;
      return NextResponse.json({ error: message }, { status });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
