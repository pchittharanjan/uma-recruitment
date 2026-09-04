export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getDb, getTeamById, initDb } from '@/lib/db';
import { forbidden, notFound, unauthorized } from '@/lib/auth';
import { getGradingEditLock } from '@/lib/advancement-submissions';
import { isTeamDirector } from '@/lib/directors';
import { requireTeamPortalUser } from '@/lib/impersonation';
import { APPLICATION_GRADER_ROLES } from '@/lib/roles';
import { runWithRequestCache } from '@/lib/request-cache';
import { resolveContextFields } from '@/lib/blind';
import { canUserAccessTeamStage } from '@/lib/stage-access';
import { getRoundSettings } from '@/lib/rounds';
import {
  getGraderAssignmentForUser,
  graderContextFieldsForSettings,
  serializeApplicationFields,
  serializePortfolioFields,
} from '@/lib/team-dashboard';
import { resolveGradingRubric, splitScoreRows } from '@/lib/grading-model';
import {
  FALL_2026_GRADER_INSTRUCTIONS,
  teamUsesApplicationPortfolio,
} from '@/lib/fall-2026-grading-model';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ applicationId: string }> },
) {
  return runWithRequestCache(() => handleGet(req, ctx));
}

async function handleGet(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> },
) {
  try {
    await initDb();
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

    const db = getDb();
    const [settings, scoresResult, progressResult, gradingEditLock] = await Promise.all([
      getRoundSettings(assignment.roundId),
      db.execute({
        sql: 'SELECT field_name, score, note FROM scores WHERE assignment_id = ?',
        args: [assignment.assignmentId],
      }),
      db.execute({
        sql: `SELECT COUNT(*) as total,
                     SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
              FROM assignments a
              JOIN applications app ON app.id = a.application_id
              WHERE a.user_id = ? AND app.team_id = ? AND a.stage = ?`,
        args: [user.id, teamId, assignment.stage],
      }),
      getGradingEditLock(teamId, assignment.roundId),
    ]);
    if (!settings) return notFound('Round not configured');

    const { scores: existingScores, notes: existingNotes } = splitScoreRows(scoresResult.rows);

    // Always strip names/identifying fields on this grader surface — including admins.
    const blind = true;
    const contextFields = graderContextFieldsForSettings(settings);
    const isDirector =
      user.role === 'exec' && (await isTeamDirector(user.id, teamId));
    const isAdminGrader = user.role === 'admin';

    const team = await getTeamById(teamId);
    if (!team) return notFound('Team not found');

    const rubric = resolveGradingRubric(settings, team.name);
    const portfolioSettings = teamUsesApplicationPortfolio(team.name)
      ? settings
      : { ...settings, portfolio_fields: [] as string[] };

    return NextResponse.json({
      applicationId: assignment.applicationId,
      assignmentId: assignment.assignmentId,
      rowIndex: assignment.rowIndex,
      fields: serializeApplicationFields(assignment.fields, settings, blind),
      portfolioFields: serializePortfolioFields(assignment.fields, portfolioSettings, blind),
      existingScores,
      existingNotes,
      existingComment: assignment.comment,
      graderProgress: {
        total: progressResult.rows[0].total as number,
        completed: progressResult.rows[0].completed as number,
      },
      scoreFields: settings.score_fields,
      customScoreFields: rubric.customScoreFields,
      gradingModel: rubric.gradingModel,
      applicationQuestions: rubric.applicationQuestions,
      contextFields: blind ? contextFields : resolveContextFields(settings),
      graderInstructions:
        settings.grader_instructions ??
        (rubric.usesCriterionRubric ? FALL_2026_GRADER_INSTRUCTIONS : null),
      gradingEditLock,
      isDirector,
      isAdminGrader,
      teamName: team.name,
      showPortfolioSection: teamUsesApplicationPortfolio(team.name),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
