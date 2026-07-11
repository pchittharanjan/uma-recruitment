export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { getTeamById, initDb } from '@/lib/db';
import { notFound, requireAuth, unauthorized } from '@/lib/auth';
import { InterviewScheduleValidationError } from '@/lib/interview-schedule-validation';
import { simulateTeamInterviewSchedule } from '@/lib/simulate-schedule';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    if (!(await requireAuth(req, { roles: ['admin'] }))) return unauthorized();

    const teamId = Number.parseInt((await params).teamId, 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'Invalid team id.' }, { status: 400 });
    }

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const result = await simulateTeamInterviewSchedule(teamId, 'final_round');
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error(e);
    if (e instanceof InterviewScheduleValidationError) {
      return NextResponse.json(
        { error: e.message, conflicts: e.validation.conflicts },
        { status: 400 },
      );
    }
    const message = e instanceof Error ? e.message : 'Internal server error';
    const status =
      message.includes('No applicants') ||
      message.includes('No interviewers') ||
      message.includes('No active round') ||
      message.includes('already closed') ||
      message.includes('Set the interview date')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
