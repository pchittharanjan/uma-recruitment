export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { requireAuth, unauthorized } from '@/lib/auth';
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

    const db = getDb();

    const asgnResult = await db.execute({
      sql: `SELECT a.id, a.application_id, a.user_id, a.status, app.team_id
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE a.id = ? AND app.team_id = ? AND a.stage = 'application'`,
      args: [assignmentId, teamId],
    });
    if (asgnResult.rows.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    const asgn = asgnResult.rows[0];
    if (asgn.status === 'completed') {
      return NextResponse.json({ error: 'Cannot reassign a completed assignment' }, { status: 400 });
    }

    const applicationId = asgn.application_id as number;
    const fromUserId = asgn.user_id as number;
    const newUserId = newUserIdRaw as number;

    if (newUserId === fromUserId) {
      return NextResponse.json({ error: 'Choose a different grader.' }, { status: 400 });
    }

    const existingResult = await db.execute({
      sql: `SELECT user_id FROM assignments WHERE application_id = ? AND stage = 'application'`,
      args: [applicationId],
    });
    const assignedUserIds = new Set(existingResult.rows.map((r) => r.user_id as number));

    if (assignedUserIds.has(newUserId)) {
      return NextResponse.json(
        { error: 'That grader is already assigned to this application.' },
        { status: 400 },
      );
    }

    const graderOnTeamResult = await db.execute({
      sql: `SELECT 1 FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE a.user_id = ? AND app.team_id = ? AND a.stage = 'application'
            LIMIT 1`,
      args: [newUserId, teamId],
    });
    if (graderOnTeamResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Selected grader is not on this team’s grading pool.' },
        { status: 400 },
      );
    }

    await db.execute({ sql: 'DELETE FROM assignments WHERE id = ?', args: [assignmentId] });
    await db.execute({
      sql: `INSERT INTO assignments (application_id, user_id, stage) VALUES (?, ?, 'application')`,
      args: [applicationId, newUserId],
    });

    const newGraderResult = await db.execute({
      sql: 'SELECT name FROM users WHERE id = ?',
      args: [newUserId],
    });
    const newGraderName = (newGraderResult.rows[0]?.name as string) ?? '';

    return NextResponse.json({ success: true, newUserId, newGraderName });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
