export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb } from '@/lib/db';
import { approveAdvancementSubmission } from '@/lib/advancement-submissions';
import { requireAuth, unauthorized } from '@/lib/auth';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const admin = await requireAuth(req, { roles: ['admin'] });
    if (!admin) return unauthorized();

    const { submissionId: submissionIdRaw } = await params;
    const submissionId = Number.parseInt(submissionIdRaw, 10);
    if (!Number.isFinite(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission id.' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body.force);

    await approveAdvancementSubmission(admin, submissionId, { force });
    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('not found') || message.includes('not pending') ? 404 : message.includes('pending') ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: message }, { status });
  }
}
