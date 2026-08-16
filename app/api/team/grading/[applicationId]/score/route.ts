export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { getRoundSettings } from '@/lib/rounds';
import { getGraderAssignmentForUser } from '@/lib/team-dashboard';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireTeamPortalUser(req, { roles: ['exec', 'ad_hoc_exec'] });
    if (!user) return unauthorized();

    const teamId = Number.parseInt(req.nextUrl.searchParams.get('teamId') ?? '', 10);
    if (!Number.isFinite(teamId)) {
      return NextResponse.json({ error: 'teamId is required.' }, { status: 400 });
    }

    if (!(await canUserAccessTeamStage(user, teamId, 'application'))) {
      return forbidden('Application Grading is not open for you yet.');
    }

    const { applicationId: appIdRaw } = await params;
    const applicationId = Number.parseInt(appIdRaw, 10);
    if (!Number.isFinite(applicationId)) {
      return NextResponse.json({ error: 'Invalid application id.' }, { status: 400 });
    }

    const assignment = await getGraderAssignmentForUser(user.id, applicationId, teamId);
    if (!assignment) return notFound('Assignment not found');
    if (assignment.stage !== 'application') {
      return forbidden('This assignment is not part of application grading.');
    }

    const gradingEditLock = await getGradingEditLock(teamId, assignment.roundId);
    if (gradingEditLock.locked) {
      return forbidden(gradingEditLock.message);
    }

    const settings = await getRoundSettings(assignment.roundId);
    if (!settings) return notFound('Round not configured');

    const body = await req.json();
    const scores = body.scores as Record<string, number>;
    const comment = (body.comment as string | undefined) ?? '';

    const scoreFields = [...settings.score_fields, ...settings.custom_score_fields];
    for (const field of scoreFields) {
      const val = scores[field];
      if (val === undefined) {
        return NextResponse.json({ error: `Missing score for field: ${field}` }, { status: 400 });
      }
      if (!Number.isInteger(val) || val < 1 || val > 5) {
        return NextResponse.json(
          { error: `Score for "${field}" must be an integer between 1 and 5` },
          { status: 400 },
        );
      }
    }

    const db = getDb();
    const assignmentId = assignment.assignmentId;

    await db.batch(
      [
        ...scoreFields.map((field) => ({
          sql: `INSERT INTO scores (assignment_id, field_name, score) VALUES (?, ?, ?)
                ON CONFLICT(assignment_id, field_name) DO UPDATE SET score = excluded.score`,
          args: [assignmentId, field, scores[field]],
        })),
        {
          sql: `UPDATE assignments SET status = 'completed', completed_at = unixepoch(), comment = ?
                WHERE id = ? AND user_id = ?`,
          args: [comment || null, assignmentId, user.id],
        },
      ],
      'write',
    );

    const next = await db.execute({
      sql: `SELECT app.id as application_id
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ?
              AND a.status = 'pending'
            ORDER BY app.row_index ASC
            LIMIT 1`,
      args: [user.id, teamId, assignment.stage],
    });

    const nextApplicationId =
      next.rows.length > 0 ? (next.rows[0].application_id as number) : null;
    const isDirector =
      nextApplicationId == null &&
      user.role === 'exec' &&
      (await isTeamDirector(user.id, teamId));

    return NextResponse.json({
      success: true,
      nextApplicationId,
      isDirector: Boolean(isDirector),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
