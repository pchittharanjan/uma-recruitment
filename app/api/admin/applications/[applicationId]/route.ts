export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { requireAuth, unauthorized, notFound, forbidden } from '@/lib/auth';
import { deleteAdminApplication, getAdminApplication } from '@/lib/admin-applications';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const { applicationId: appIdRaw } = await params;
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
    }

    const application = await getAdminApplication(applicationId);
    if (!application) return notFound('Application not found.');

    return NextResponse.json({ application });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    const body = await req.json().catch(() => ({}));
    const teamId = typeof body.teamId === 'number' ? body.teamId : null;
    if (!teamId) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    const existing = await getAdminApplication(applicationId);
    if (!existing) return notFound('Application not found.');
    if (existing.teamId !== teamId) return forbidden('Team mismatch.');

    const deleted = await deleteAdminApplication(applicationId, teamId);
    if (!deleted) return notFound('Application not found.');

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
