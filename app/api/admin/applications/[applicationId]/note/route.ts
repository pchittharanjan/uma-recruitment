export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { requireAuth, unauthorized, forbidden } from '@/lib/auth';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { applicationId: appIdRaw } = await params;
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
    }

    const { note, teamId } = await req.json();
    if (!teamId || typeof teamId !== 'number') {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    const db = getDb();
    const result = await db.execute({
      sql: 'UPDATE applications SET admin_note = ? WHERE id = ? AND team_id = ?',
      args: [note ?? null, applicationId, teamId],
    });

    if (result.rowsAffected === 0) {
      return forbidden();
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
