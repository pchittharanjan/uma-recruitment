export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { resolveContextFields } from '@/lib/blind';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { getRoundSettings } from '@/lib/rounds';
import {
  getGraderAssignmentForUser,
  graderContextFieldsForSettings,
  serializeApplicationFields,
  userSeesBlindApplications,
} from '@/lib/team-dashboard';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
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

    const settings = await getRoundSettings(assignment.roundId);
    if (!settings) return notFound('Round not configured');

    const db = getDb();
    const scoresResult = await db.execute({
      sql: 'SELECT field_name, score FROM scores WHERE assignment_id = ?',
      args: [assignment.assignmentId],
    });
    const existingScores: Record<string, number> = {};
    for (const row of scoresResult.rows) {
      existingScores[row.field_name as string] = row.score as number;
    }

    const progressResult = await db.execute({
      sql: `SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
            FROM assignments a
            JOIN applications app ON app.id = a.application_id
            WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ? AND app.stage = ?`,
      args: [user.id, teamId, assignment.stage, assignment.stage],
    });

    const blind = userSeesBlindApplications(user);
    const contextFields = graderContextFieldsForSettings(settings);
    const gradingEditLock = await getGradingEditLock(teamId, assignment.roundId);

    return NextResponse.json({
      applicationId: assignment.applicationId,
      assignmentId: assignment.assignmentId,
      rowIndex: assignment.rowIndex,
      fields: serializeApplicationFields(assignment.fields, settings, blind),
      existingScores,
      existingComment: assignment.comment,
      graderProgress: {
        total: progressResult.rows[0].total as number,
        completed: progressResult.rows[0].completed as number,
      },
      scoreFields: settings.score_fields,
      customScoreFields: settings.custom_score_fields,
      contextFields: blind ? contextFields : resolveContextFields(settings),
      graderInstructions: settings.grader_instructions,
      gradingEditLock,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
