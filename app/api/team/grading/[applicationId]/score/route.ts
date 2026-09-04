export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { APPLICATION_GRADER_ROLES } from '@/lib/roles';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { getRoundSettings } from '@/lib/rounds';
import { getGraderAssignmentForUser } from '@/lib/team-dashboard';
import {
  primaryScoredQuestions,
  questionNotesKey,
  requiredGradingScoreFields,
  resolveGradingRubric,
} from '@/lib/grading-model';
import { assertPipelineWritable } from '@/lib/pipeline-writable';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
    const closed = await assertPipelineWritable();
    if (closed) return closed;
    const user = await requireTeamPortalUser(req, { roles: [...APPLICATION_GRADER_ROLES] });
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

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const body = await req.json();
    const scores = body.scores as Record<string, number>;
    const notes = (body.notes as Record<string, string> | undefined) ?? {};
    const comment = (body.comment as string | undefined) ?? '';

    const scoreFields = requiredGradingScoreFields(settings, team.name);
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

    const rubric = resolveGradingRubric(settings, team.name);
    const noteValue = (key: string): string | null => {
      const value = notes[key]?.trim();
      return value ? value : null;
    };
    const questionNoteRows = rubric.usesCriterionRubric
      ? primaryScoredQuestions(rubric.applicationQuestions).map((question) => ({
          sql: `INSERT INTO scores (assignment_id, field_name, score, note) VALUES (?, ?, NULL, ?)
                ON CONFLICT(assignment_id, field_name) DO UPDATE SET note = excluded.note`,
          args: [assignment.assignmentId, questionNotesKey(question.id), noteValue(question.id)],
        }))
      : [];

    const db = getDb();
    const assignmentId = assignment.assignmentId;

    await db.batch(
      [
        ...scoreFields.map((field) => ({
          sql: `INSERT INTO scores (assignment_id, field_name, score, note) VALUES (?, ?, ?, ?)
                ON CONFLICT(assignment_id, field_name) DO UPDATE SET
                  score = excluded.score,
                  note = excluded.note`,
          args: [
            assignmentId,
            field,
            scores[field],
            rubric.usesCriterionRubric ? null : noteValue(field),
          ],
        })),
        ...questionNoteRows,
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
    const queueComplete = nextApplicationId == null;
    const isDirector =
      queueComplete && user.role === 'exec' && (await isTeamDirector(user.id, teamId));
    const advancementHref =
      queueComplete && user.role === 'exec' && !gradingEditLock.locked
        ? `/team/${teamId}/advancement`
        : null;

    return NextResponse.json({
      success: true,
      nextApplicationId,
      isDirector: Boolean(isDirector),
      isAdminGrader: user.role === 'admin',
      advancementHref,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
